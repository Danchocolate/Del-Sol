import { useEffect, useRef, useState } from 'react';
import { ErrorNotice } from './ui';
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}
let scriptPromise: Promise<void> | undefined;
function loadScript() {
  return (scriptPromise ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error('Security check could not load. Check your connection and reload.'));
    };
    document.head.append(script);
  }));
}
export function Turnstile({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string) => void;
  resetKey?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let id: string | undefined;
    setError('');
    callback.current('');
    void loadScript()
      .then(() => {
        if (!cancelled && ref.current)
          id = window.turnstile?.render(ref.current, {
            sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
            theme: 'light',
            callback: (token: string) => callback.current(token),
            'expired-callback': () => callback.current(''),
            'error-callback': () => {
              callback.current('');
              setError('Security check failed. Reload to try again.');
            },
          });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [resetKey]);
  return (
    <div className="bot-check">
      <div ref={ref} />
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
    </div>
  );
}
