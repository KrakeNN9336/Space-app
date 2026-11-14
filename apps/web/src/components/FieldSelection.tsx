import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyzeResponse, CropOption, Field, Lang } from "@field-shift/shared";
import { RADIUS_KM_DEFAULT } from "@field-shift/shared";
import { analyze, getCrops, getField } from "../api";
import { translate, type MessageKey } from "../i18n";
import { FieldMap } from "../map/FieldMap";
import { AnalysisResult } from "./AnalysisResult";
import { CropHistory } from "./CropHistory";

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
  const lastYear = new Date().getFullYear();
  const years = [lastYear - 2, lastYear - 1, lastYear];
  const [crops, setCrops] = useState<CropOption[]>([]);
  const [history, setHistory] = useState<string[][]>([["unknown"], ["unknown"], ["unknown"]]);
  useEffect(() => {
    getCrops()
      .then((res) => setCrops(res.crops))
      .catch(() => setCrops([]));
  }, []);

  const handleMapClick = useCallback((lat: number, lon: number, hit?: Field) => {
    const id = ++lookup.current;
    setResult(null);
    setRun({ kind: "idle" });
    if (hit) {
      setPicked({ lat, lon, field: hit, searching: false });
      return;
    }
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
    setRun({ kind: "loading" });
    analyze({
      location: { lat: picked.lat, lon: picked.lon },
      field: picked.field,
      radiusKm: RADIUS_KM_DEFAULT,
      history: years.map((year, i) => ({ year, crops: history[i] })),
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
            text: t(picked.field.source === "ftw" ? "field.ftwDescription" : "field.foundDescription", { area: (picked.field.areaHa ?? 0).toFixed(1) }),
          };

  return (
    <>
      <section className="field-section" aria-labelledby="field-title">
        <div className="field-section-heading">
          <span className="field-eyebrow">{t("field.step")}</span>
          <h2 id="field-title">{t("field.title")}</h2>
          <p>{t("field.description")}</p>
        </div>

        <div className="field-map-host">
          <FieldMap
            field={picked?.field ?? null}
            analysis={result}
            lang={lang}
            onMapClick={handleMapClick}
            panelSlot={
              <div className="field-map-slot" role="status">
                <strong>{status.title}</strong>
                <p>{status.text}</p>
                {picked && (
                  <p>
                    {picked.lat.toFixed(4)}, {picked.lon.toFixed(4)}
                  </p>
                )}
              </div>
            }
          />
        </div>

        {picked && (
          <div className="history-step">
            <span className="field-eyebrow">{t("history.step")}</span>
            <h3>{t("history.title")}</h3>
            <p>{t("history.description")}</p>
            <CropHistory lang={lang} crops={crops} years={years} value={history} onChange={setHistory} />
            <button type="button" className="field-analyze" disabled={run.kind === "loading"} onClick={runAnalysis}>
              {run.kind === "loading" ? t("analyze.loading") : t("analyze.button")}
            </button>
            {run.kind === "error" && (
              <p className="field-error" role="alert">
                {t("analyze.error")} {run.message}
              </p>
            )}
          </div>
        )}

        <ol className="field-steps">
          <li>{t("field.instructionOne")}</li>
          <li>{t("field.instructionTwo")}</li>
          <li>{t("field.instructionThree")}</li>
        </ol>
      </section>

      {result && <AnalysisResult lang={lang} result={result} />}
    </>
  );
}
