/**
 * App shell: header, language switch, the field step and the API status.
 * Vlad (branch `ui`) extends this with the remaining wizard steps.
 */
import { useEffect, useState } from "react";
import type { Lang } from "@field-shift/shared";
import { getHealth } from "./api";
import { translate, type MessageKey } from "./i18n";
import { FieldSelection } from "./components/FieldSelection";

type ApiState = { kind: "checking" } | { kind: "ok"; version: string } | { kind: "down" };

export function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [api, setApi] = useState<ApiState>({ kind: "checking" });
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  useEffect(() => {
    document.documentElement.lang = lang;
    getHealth()
      .then((h) => setApi({ kind: "ok", version: h.contract }))
      .catch(() => setApi({ kind: "down" }));
  }, [lang]);

  const apiText =
    api.kind === "ok"
      ? t("scaffold.apiOk", { version: api.version })
      : api.kind === "down"
        ? t("scaffold.apiDown")
        : t("scaffold.apiChecking");

  return (
    <main>
      <header className="header">
        <div>
          <h1>{t("app.title")}</h1>
          <div className="muted">{t("app.tagline")}</div>
        </div>
        <button type="button" onClick={() => setLang(lang === "en" ? "uk" : "en")}>
          {t("lang.switch")}
        </button>
      </header>

      <FieldSelection lang={lang} />

      <section className="card">
        <strong>{t("scaffold.api")}:</strong> {apiText}
      </section>

      <p className="muted">{t("disclaimer")}</p>
    </main>
  );
}
