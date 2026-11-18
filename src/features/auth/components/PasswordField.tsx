import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authInputClass } from "./AuthFrame";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; id: string };

export function PasswordField({ label, id, ...input }: Props) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="ml-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <input
          {...input}
          id={id}
          type={visible ? "text" : "password"}
          className={`${authInputClass} pr-14`}
        />
        <button
          type="button"
          aria-controls={id}
          aria-pressed={visible}
          aria-label={t(visible ? "auth.hidePassword" : "auth.showPassword", { field: label })}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-1 grid min-h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
