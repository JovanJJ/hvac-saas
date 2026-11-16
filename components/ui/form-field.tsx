import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  errors?: string[];
  hint?: string;
};
export function FormField({ label, errors, hint, id, ...props }: Props) {
  const helpId = `${id}-help`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="m-0 block text-sm font-semibold">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={Boolean(errors?.length)}
        aria-describedby={errors?.length || hint ? helpId : undefined}
        className="w-full rounded-md border border-[#b9c8bc] bg-white px-3 py-3 text-base"
      />
      {(errors?.length || hint) && (
        <div
          id={helpId}
          className={
            errors?.length ? "text-sm text-[#8a3528]" : "text-xs text-[#60716c]"
          }
        >
          {errors?.map((error) => <p key={error}>{error}</p>) ?? hint}
        </div>
      )}
    </div>
  );
}
