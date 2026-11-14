import { useCallback, useRef, useState } from "react";
import type { AnalyzeResponse, Field, Lang } from "@field-shift/shared";
import { RADIUS_KM_DEFAULT } from "@field-shift/shared";
import { analyze, getField } from "../api";
import { translate, type MessageKey } from "../i18n";
import { FieldMap } from "../map/FieldMap";
import { AnalysisResult } from "./AnalysisResult";

type Props = {
  lang: Lang;
};

type Picked = { lat: number; lon: number; field: Field; searching: boolean };
type Run = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

const pointField = (lat: number, lon: number): Field => ({
  source: "point",
  geometry: { type: "Point", coordinates: [lon, lat] },
});

export function FieldSelection({ lang }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const lookup = useRef(0);

  const handleMapClick = useCallback((lat: number, lon: number) => {
    const id = ++lookup.current;
    setResult(null);
    setRun({ kind: "idle" });
    setPicked({ lat, lon, field: pointField(lat, lon), searching: true });
    getField(lat, lon)
      .then((res) => {
        if (id !== lookup.current) return;
        setPicked({ lat, lon, field: res.field ?? pointField(lat, lon), searching: false });
      })
      .catch(() => {
        // No boundary service: keep the point, which the contract allows.
        if (id === lookup.current) setPicked({ lat, lon, field: pointField(lat, lon), searching: false });
      });
  }, []);

  const runAnalysis = () => {
    if (!picked) return;
    const lastYear = new Date().getFullYear();
    setRun({ kind: "loading" });
    analyze({
      location: { lat: picked.lat, lon: picked.lon },
      field: picked.field,
      radiusKm: RADIUS_KM_DEFAULT,
      // The history step of the wizard is not built yet, so the history is sent as unknown.
      history: [lastYear - 2, lastYear - 1, lastYear].map((year) => ({ year, crops: ["unknown"] })),
      lang,
    })
      .then((res) => {
        setResult(res);
        setRun({ kind: "idle" });
      })
      .catch((err: Error) => setRun({ kind: "error", message: err.message }));
  };

  const status = !picked
    ? { title: t("field.pendingTitle"), text: t("field.pendingDescription") }
    : picked.searching
      ? { title: t("field.searchingTitle"), text: t("field.searchingDescription") }
      : picked.field.source === "point"
        ? { title: t("field.pointTitle"), text: t("field.pointDescription") }
        : {
            title: t("field.foundTitle"),
            text: t("field.foundDescription", { area: (picked.field.areaHa ?? 0).toFixed(1) }),
          };

  return (
    <>
      <section className="field-section" aria-labelledby="field-title">
        <div className="field-section-heading">
          <span className="field-eyebrow">{t("field.step")}</span>
          <h2 id="field-title">{t("field.title")}</h2>
          <p>{t("field.description")}</p>
        </div>

        <div className="field-layout">
          <div className="field-map-host">
            <FieldMap field={picked?.field ?? null} analysis={result} onMapClick={handleMapClick} />
          </div>

          <aside className="field-instructions">
            <span className="field-eyebrow">{t("field.guide")}</span>
            <h3>{t("field.guideTitle")}</h3>

            <div className="field-instruction">
              <span className="field-instruction-number">1</span>
              <p>{t("field.instructionOne")}</p>
            </div>

            <div className="field-instruction">
              <span className="field-instruction-number">2</span>
              <p>{t("field.instructionTwo")}</p>
            </div>

            <div className="field-instruction">
              <span className="field-instruction-number">3</span>
              <p>{t("field.instructionThree")}</p>
            </div>

            <div className="field-map-status" role="status">
              <strong>{status.title}</strong>
              <p>{status.text}</p>
              {picked && (
                <p>
                  {picked.lat.toFixed(4)}, {picked.lon.toFixed(4)}
                </p>
              )}
            </div>

            <button
              type="button"
              className="field-analyze"
              disabled={!picked || run.kind === "loading"}
              onClick={runAnalysis}
            >
              {run.kind === "loading" ? t("analyze.loading") : t("analyze.button")}
            </button>
            {run.kind === "error" && (
              <p className="field-error" role="alert">
                {t("analyze.error")} {run.message}
              </p>
            )}
          </aside>
        </div>
      </section>

      {result && <AnalysisResult lang={lang} result={result} />}
    </>
  );
}
