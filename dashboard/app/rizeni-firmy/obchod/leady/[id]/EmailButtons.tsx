import { emailTemplates, mailtoHref, type EmailTemplateKind } from "@/lib/obchod/emailTemplates";

/** Tlačítka „E-mail po hovoru“ / „E-mail – nedovolal/a jsem se“ (otevřou e-mail v telefonu). */
export default function EmailButtons({
  email,
  salesName,
  salesPhone = null,
  only,
}: {
  email: string;
  salesName: string | null;
  salesPhone?: string | null;
  only?: EmailTemplateKind;
}) {
  const list = emailTemplates(salesName, salesPhone).filter((t) => !only || t.kind === only);
  return (
    <div className="flex gap-2 flex-wrap">
      {list.map((t) => (
        <a
          key={t.kind}
          href={mailtoHref(email, t)}
          className="rounded-lg border border-begina-primary-900 px-3 py-2 text-xs font-medium text-begina-primary-900"
        >
          ✉️ {t.label}
        </a>
      ))}
    </div>
  );
}
