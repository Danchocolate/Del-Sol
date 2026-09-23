import { useState } from 'react';
import { ErrorNotice, Field } from '../components/ui';
import { message } from '../lib/api';
export interface FieldSpec {
  name: string;
  label: string;
  type?:
    | 'text'
    | 'number'
    | 'textarea'
    | 'checkbox'
    | 'select'
    | 'date'
    | 'datetime-local'
    | 'password'
    | 'email';
  options?: { value: string; label: string }[];
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
}
export type FormValue = string | number | boolean | null | string[];
export function Editor({
  fields,
  initial = {},
  onSave,
  onCancel,
  submit = 'Save changes',
}: {
  fields: FieldSpec[];
  initial?: Record<string, FormValue>;
  onSave: (values: Record<string, FormValue>) => Promise<unknown>;
  onCancel?: () => void;
  submit?: string;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  return (
    <form
      className="editor form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const values: Record<string, FormValue> = {};
        for (const field of fields) {
          const raw = data.get(field.name);
          values[field.name] =
            field.type === 'checkbox'
              ? raw === 'on'
              : field.type === 'number'
                ? raw === ''
                  ? null
                  : Number(raw)
                : String(raw ?? '');
        }
        setBusy(true);
        setError('');
        setNotice('');
        try {
          await onSave(values);
          setNotice('Changes saved.');
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((field) => {
        const value = initial[field.name];
        if (field.type === 'checkbox')
          return (
            <label className="check-label" key={field.name}>
              <input type="checkbox" name={field.name} defaultChecked={Boolean(value)} />
              {field.label}
            </label>
          );
        return (
          <Field label={field.label} hint={field.hint} key={field.name}>
            {field.type === 'textarea' ? (
              <textarea
                name={field.name}
                defaultValue={String(value ?? '')}
                required={field.required ?? true}
                maxLength={field.max ?? 4000}
              />
            ) : field.type === 'select' ? (
              <select
                name={field.name}
                defaultValue={String(value ?? '')}
                required={field.required ?? true}
              >
                {field.options?.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={field.name}
                type={field.type ?? 'text'}
                defaultValue={String(value ?? '')}
                required={field.required ?? true}
                min={field.min}
                max={field.type === 'number' ? field.max : undefined}
                maxLength={field.type !== 'number' ? field.max : undefined}
                step={field.step}
              />
            )}
          </Field>
        );
      })}
      {error ? (
        <div className="wide">
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="success-notice wide">
          {notice}
        </p>
      ) : null}
      <div className="actions wide">
        <button className="button" disabled={busy}>
          {busy ? 'Saving…' : submit}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel}>
            Close editor
          </button>
        ) : null}
      </div>
    </form>
  );
}
