
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalyzeResponse,
  CropOption,
  Field,
  Lang,
} from "@field-shift/shared";
import { RADIUS_KM_DEFAULT } from "@field-shift/shared";
import { analyze, getCrops, getField } from "../api";
import { translate, type MessageKey } from "../i18n";
import { FieldMap } from "../map/FieldMap";
import { AnalysisResult } from "./AnalysisResult";
import { CropHistory } from "./CropHistory";

type Props = {
  lang: Lang;
};

type Picked = {
  lat: number;
  lon: number;
  field: Field;
  searching: boolean;
};

type Run =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

type Step = "field" | "history" | "analysis" | "results" | "details";

const STEPS: Step[] = [
  "field",
  "history",
  "analysis",
  "results",
  "details",
];

const pointField = (lat: number, lon: number): Field => ({
  source: "point",
  geometry: {
    type: "Point",
    coordinates: [lon, lat],
  },
});

const labels = {
  uk: {
    back: "Назад",
    next: "Продовжити",
    field: "Поле",
    history: "Посіви",
    analysis: "Аналіз",
    results: "Результати",
    details: "Деталі",
    selected: "Поле вибрано",
    chooseField: "Спочатку виберіть поле на карті",
    changeField: "Змінити поле",
    analysisTitle: "Усе готово до аналізу",
    analysisDescription:
      "Ми використаємо розташування поля та історію посівів, щоб отримати рекомендації.",
    analysisLocation: "Розташування",
    analysisArea: "Площа",
    analysisHistory: "Історія посівів",
    years: "3 роки",
    hectares: "га",
    point: "Точка на карті",
    unknownArea: "Не визначена",
    loadingTitle: "Аналізуємо ваше поле",
    loadingDescription:
      "Отримуємо кліматичні та інші доступні дані. Це може зайняти деякий час.",
    resultTitle: "Рекомендації для вашого поля",
    resultDescription:
      "Ознайомтеся з рекомендованими культурами та причинами їх вибору.",
    cropDetails: "Детальніше",
    detailsTitle: "Детальний аналіз",
    detailsDescription:
      "Тут зібрані показники, пояснення, ризики та доступні джерела даних.",
    selectedCrop: "Обрана культура",
    suitability: "Оцінка придатності",
    share: "Рекомендована частка",
    confidence: "Рівень впевненості",
    viewDetails: "Переглянути деталі аналізу",
    restart: "Новий аналіз",
    unavailable: "Немає даних",
    step: "Крок",
    of: "з",
  },
  en: {
    back: "Back",
    next: "Continue",
    field: "Field",
    history: "Crop history",
    analysis: "Analysis",
    results: "Results",
    details: "Details",
    selected: "Field selected",
    chooseField: "First select a field on the map",
    changeField: "Change field",
    analysisTitle: "Ready to analyze",
    analysisDescription:
      "We will use the field location and crop history to generate recommendations.",
    analysisLocation: "Location",
    analysisArea: "Area",
    analysisHistory: "Crop history",
    years: "3 years",
    hectares: "ha",
    point: "Map point",
    unknownArea: "Not available",
    loadingTitle: "Analyzing your field",
    loadingDescription:
      "Collecting climate and other available data. This may take a moment.",
    resultTitle: "Recommendations for your field",
    resultDescription:
      "Explore recommended crops and the reasons behind these suggestions.",
    cropDetails: "View details",
    detailsTitle: "Detailed analysis",
    detailsDescription:
      "Explore field measurements, explanations, risks and available data sources.",
    selectedCrop: "Selected crop",
    suitability: "Suitability score",
    share: "Recommended share",
    confidence: "Confidence",
    viewDetails: "View detailed analysis",
    restart: "New analysis",
    unavailable: "No data",
    step: "Step",
    of: "of",
  },
};

export function FieldSelection({ lang }: Props) {
  const t = (
    key: MessageKey,
    vars?: Record<string, string | number>,
  ) => translate(lang, key, vars);

  const ui = labels[lang];

  const [step, setStep] = useState<Step>("field");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);

  const lookup = useRef(0);

  const lastYear = new Date().getFullYear();
  const years = [lastYear - 2, lastYear - 1, lastYear];

  const [crops, setCrops] = useState<CropOption[]>([]);
  const [history, setHistory] = useState<string[][]>([
    ["unknown"],
    ["unknown"],
    ["unknown"],
  ]);

  useEffect(() => {
    getCrops()
      .then((response) => setCrops(response.crops))
      .catch(() => setCrops([]));
  }, []);

  const handleMapClick = useCallback(
    (lat: number, lon: number, hit?: Field) => {
      const id = ++lookup.current;

      setResult(null);
      setSelectedCropId(null);
      setRun({ kind: "idle" });

      if (hit) {
        setPicked({
          lat,
          lon,
          field: hit,
          searching: false,
        });
        return;
      }

      setPicked({
        lat,
        lon,
        field: pointField(lat, lon),
        searching: true,
      });

      getField(lat, lon)
        .then((response) => {
          if (id !== lookup.current) return;

          setPicked({
            lat,
            lon,
            field: response.field ?? pointField(lat, lon),
            searching: false,
          });
        })
        .catch(() => {
          if (id !== lookup.current) return;

          setPicked({
            lat,
            lon,
            field: pointField(lat, lon),
            searching: false,
          });
        });
    },
    [],
  );

  const runAnalysis = () => {
    if (!picked || picked.searching || run.kind === "loading") return;

    const requestId = ++lookup.current;

    setStep("analysis");
    setResult(null);
    setSelectedCropId(null);
    setRun({ kind: "loading" });

    analyze({
      location: {
        lat: picked.lat,
        lon: picked.lon,
      },
      field: picked.field,
      radiusKm: RADIUS_KM_DEFAULT,
      history: years.map((year, index) => ({
        year,
        crops: history[index],
      })),
      lang,
    })
      .then((response) => {
        if (requestId !== lookup.current) return;

        setResult(response);
        setRun({ kind: "idle" });
        setStep("results");
      })
      .catch((error: Error) => {
        if (requestId !== lookup.current) return;

        setRun({
          kind: "error",
          message: error.message,
        });
      });
  };

  const restart = () => {
    ++lookup.current;

    setStep("field");
    setPicked(null);
    setResult(null);
    setSelectedCropId(null);
    setRun({ kind: "idle" });
    setHistory([
      ["unknown"],
      ["unknown"],
      ["unknown"],
    ]);
  };

  const status = !picked
    ? {
        title: t("field.pendingTitle"),
        text: t("field.pendingDescription"),
      }
    : picked.searching
      ? {
          title: t("field.searchingTitle"),
          text: t("field.searchingDescription"),
        }
      : picked.field.source === "point"
        ? {
            title: t("field.pointTitle"),
            text: t("field.pointDescription"),
          }
        : {
            title: t("field.foundTitle"),
            text:
              picked.field.areaHa == null
                ? picked.field.note ?? ui.unknownArea
                : t(
                    picked.field.source === "ftw"
                      ? "field.ftwDescription"
                      : "field.foundDescription",
                    { area: picked.field.areaHa.toFixed(1) },
                  ),
          };

  const currentStepIndex = STEPS.indexOf(step);
  const selectedCrop = result?.recommendation.crops.find(
    (crop) => crop.id === selectedCropId,
  );

  const canOpenStep = (target: Step): boolean => {
    if (run.kind === "loading") return target === "analysis";

    if (target === "field") return true;
    if (target === "history" || target === "analysis") {
      return !!picked && !picked.searching;
    }

    return result !== null;
  };

  const openStep = (target: Step) => {
    if (canOpenStep(target)) setStep(target);
  };

  const wizardButtonStyle = {
    padding: "12px 20px",
    borderRadius: "12px",
    fontWeight: 700,
  };

  return (
    <>
      <nav
        aria-label={lang === "uk" ? "Етапи аналізу" : "Analysis steps"}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "8px",
          marginTop: "24px",
        }}
      >
        {STEPS.map((item, index) => {
          const active = step === item;
          const enabled = canOpenStep(item);

          return (
            <button
              key={item}
              type="button"
              disabled={!enabled}
              aria-current={active ? "step" : undefined}
              onClick={() => openStep(item)}
              style={{
                minWidth: 0,
                padding: "12px 5px",
                borderRadius: "14px",
                background: active ? "#245a41" : "#f2f5f0",
                color: active ? "#ffffff" : "#42564b",
                border: active
                  ? "1px solid #245a41"
                  : "1px solid #d9e4da",
                opacity: enabled ? 1 : 0.5,
                display: "grid",
                justifyItems: "center",
                gap: "4px",
              }}
            >
              <span style={{ fontWeight: 800, fontSize: "15px" }}>
                {String(index + 1).padStart(2, "0")}
              </span>

              <span style={{ fontSize: "clamp(9px, 1.6vw, 13px)" }}>
                {ui[item]}
              </span>
            </button>
          );
        })}
      </nav>

      <section
        className="field-section"
        aria-labelledby="wizard-title"
        style={{ minHeight: "350px" }}
      >
        <div className="field-section-heading">
          <span className="field-eyebrow">
            {ui.step} {currentStepIndex + 1} {ui.of} 5
          </span>

          <h2 id="wizard-title">
            {step === "field" && t("field.title")}
            {step === "history" && t("history.title")}
            {step === "analysis" && ui.analysisTitle}
            {step === "results" && ui.resultTitle}
            {step === "details" && ui.detailsTitle}
          </h2>

          <p>
            {step === "field" && t("field.description")}
            {step === "history" && t("history.description")}
            {step === "analysis" && ui.analysisDescription}
            {step === "results" && ui.resultDescription}
            {step === "details" && ui.detailsDescription}
          </p>
        </div>

        {step === "field" && (
          <>
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

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              <span className="muted">
                {picked && !picked.searching
                  ? ui.selected
                  : ui.chooseField}
              </span>

              <button
                type="button"
                disabled={!picked || picked.searching}
                onClick={() => setStep("history")}
                style={wizardButtonStyle}
              >
                {ui.next} →
              </button>
            </div>
          </>
        )}

        {step === "history" && (
          <>
            <CropHistory
              lang={lang}
              crops={crops}
              years={years}
              value={history}
              onChange={setHistory}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                marginTop: "24px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setStep("field")}
                style={wizardButtonStyle}
              >
                ← {ui.back}
              </button>

              <button
                type="button"
                onClick={() => setStep("analysis")}
                style={wizardButtonStyle}
              >
                {ui.next} →
              </button>
            </div>
          </>
        )}

        {step === "analysis" && (
          <div
            style={{
              maxWidth: "720px",
              margin: "20px auto",
              padding: "24px",
              background: "#f2f7f1",
              border: "1px solid #d8e5d8",
              borderRadius: "18px",
            }}
          >
            {run.kind === "loading" ? (
              <div role="status" style={{ textAlign: "center", padding: "35px 0" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    margin: "0 auto 20px",
                    border: "4px solid #d8e8dc",
                    borderTopColor: "#286346",
                    borderRadius: "50%",
                    animation: "regionagro-spin 0.9s linear infinite",
                  }}
                />

                <h3>{ui.loadingTitle}</h3>
                <p className="muted">{ui.loadingDescription}</p>

                <style>
                  {`
                    @keyframes regionagro-spin {
                      to { transform: rotate(360deg); }
                    }
                    @media (prefers-reduced-motion: reduce) {
                      div[role="status"] div {
                        animation: none !important;
                      }
                    }
                  `}
                </style>
              </div>
            ) : (
              <>
                <h3>{ui.analysisTitle}</h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                    gap: "12px",
                    margin: "20px 0",
                  }}
                >
                  <div className="result-card">
                    <strong>{ui.analysisLocation}</strong>
                    <p>
                      {picked
                        ? `${picked.lat.toFixed(4)}, ${picked.lon.toFixed(4)}`
                        : ui.unavailable}
                    </p>
                  </div>

                  <div className="result-card">
                    <strong>{ui.analysisArea}</strong>
                    <p>
                      {picked?.field.areaHa != null
                        ? `${picked.field.areaHa.toFixed(1)} ${ui.hectares}`
                        : ui.unknownArea}
                    </p>
                  </div>

                  <div className="result-card">
                    <strong>{ui.analysisHistory}</strong>
                    <p>{ui.years}</p>
                  </div>
                </div>

                {run.kind === "error" && (
                  <p className="field-error" role="alert">
                    {t("analyze.error")} {run.message}
                  </p>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setStep("history")}
                    style={wizardButtonStyle}
                  >
                    ← {ui.back}
                  </button>

                  <button
                    type="button"
                    onClick={runAnalysis}
                    disabled={!picked || picked.searching}
                    style={{
                      ...wizardButtonStyle,
                      background: "#245a41",
                      color: "#ffffff",
                    }}
                  >
                    {t("analyze.button")} →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "results" && result && (
          <>
            {result.recommendation.warnings.map((warning) => (
              <p className="result-banner" key={warning}>
                {warning}
              </p>
            ))}

            <div className="result-grid">
              {result.recommendation.crops.map((crop) => (
                <article className="result-card" key={crop.id}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "flex-start",
                    }}
                  >
                    <h3>{crop.name}</h3>
                    <strong>{crop.sharePct}%</strong>
                  </div>

                  <p>{crop.why}</p>
                  <small>
                    {ui.suitability}: {crop.score}/100
                  </small>

                  <div style={{ marginTop: "14px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCropId(crop.id);
                        setStep("details");
                      }}
                    >
                      {ui.cropDetails} →
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="result-grid">
              <article className="result-card result-avoid">
                <h3>{t("result.avoid")}</h3>

                {result.recommendation.avoid?.length ? (
                  <ul className="result-list">
                    {result.recommendation.avoid.map((crop) => (
                      <li key={crop.id}>
                        <strong>{crop.name}</strong>
                        <p>{crop.why}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t("result.avoidNone")}</p>
                )}
              </article>

              <article className="result-card">
                <h3>{t("result.strategies")}</h3>

                {result.recommendation.strategies.map((strategy) => (
                  <p key={strategy.id}>
                    <strong>{strategy.title}</strong>
                    {" · "}
                    {strategy.score}/100
                  </p>
                ))}
              </article>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                marginTop: "24px",
              }}
            >
              <button
                type="button"
                onClick={() => setStep("analysis")}
              >
                ← {ui.back}
              </button>

              <button
                type="button"
                onClick={() => setStep("details")}
                style={{
                  ...wizardButtonStyle,
                  background: "#245a41",
                  color: "#ffffff",
                }}
              >
                {ui.viewDetails} →
              </button>
            </div>
          </>
        )}

        {step === "details" && result && (
          <>
            {selectedCrop && (
              <article className="result-card result-sow">
                <span className="field-eyebrow">{ui.selectedCrop}</span>
                <h3>{selectedCrop.name}</h3>

                <p>{selectedCrop.why}</p>

                <p>
                  <strong>{ui.suitability}:</strong>{" "}
                  {selectedCrop.score}/100
                </p>

                <p>
                  <strong>{ui.share}:</strong>{" "}
                  {selectedCrop.sharePct}%
                </p>
              </article>
            )}

            <AnalysisResult lang={lang} result={result} />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                marginTop: "24px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setStep("results")}
              >
                ← {ui.back}
              </button>

              <button
                type="button"
                onClick={restart}
                style={wizardButtonStyle}
              >
                {ui.restart}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
