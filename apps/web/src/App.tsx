/**
 * SCAFFOLD screen by the team lead: proves that web + API + contract are wired together.
 * Vlad (branch `ui`) replaces this file with the wizard and the result screen.
 */
import { useEffect, useState } from "react";
import type { AnalyzeRequest, AnalyzeResponse, Lang } from "@field-shift/shared";
import mockRequest from "@field-shift/shared/mock-request.json";
import { analyze, getHealth } from "./api";
import { translate, type MessageKey } from "./i18n";
import { FieldSelection } from "./components/FieldSelection";

type ApiState = { kind: "checking" } | { kind: "ok"; version: string } | { kind: "down" };

export function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [api, setApi] = useState<ApiState>({ kind: "checking" });
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  useEffect(() => {
    document.documentElement.lang = lang;
    getHealth()
      .then((h) => setApi({ kind: "ok", version: h.contract }))
      .catch(() => setApi({ kind: "down" }));
    analyze({ ...(mockRequest as AnalyzeRequest), lang })
      .then(setResult)
      .catch(() => setResult(null));
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
        <p style={{ marginTop: 0 }}>{t("scaffold.note")}</p>
        <strong>{t("scaffold.api")}:</strong> {apiText}
      </section>

      {result && (
        <section className="card">
          <h2>{t("scaffold.sample")}</h2>
          <ul>
            {result.recommendation.crops.map((crop) => (
              <li key={crop.id}>
                <strong>{crop.sharePct}%</strong> {crop.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted">{t("disclaimer")}</p>
    </main>
  );
}
