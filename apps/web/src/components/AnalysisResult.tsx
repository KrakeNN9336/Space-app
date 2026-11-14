import { useEffect, useState } from "react";
import type { AnalyzeResponse, CropOption, DataStatusValue, Lang, RangeValue } from "@field-shift/shared";
import { getCrops } from "../api";
import { translate, type MessageKey } from "../i18n";

type Props = {
  lang: Lang;
  result: AnalyzeResponse;
};

const fmt = (value: number | null | undefined, digits = 1): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";

const median = (range: RangeValue): string => fmt(range.median);

/** Minimal result view: real climate, soil and terrain first, then the (flagged) recommendation. */
export function AnalysisResult({ lang, result }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const { climate, soil, terrain, stress, recommendation, dataStatus } = result;
  const statusText = (value: DataStatusValue) => t(`status.${value}` as MessageKey);
  const [crops, setCrops] = useState<CropOption[]>([]);
  useEffect(() => {
    getCrops()
      .then((res) => setCrops(res.crops))
      .catch(() => setCrops([]));
  }, []);
  const cropName = (id: string): string =>
    id === "fallow" ? t("crop.fallow") : (crops.find((crop) => crop.id === id)?.name[lang] ?? id);
  const degraded = Object.values(dataStatus).some((value) => value !== "live");

  return (
    <section className="result-section" aria-labelledby="result-title">
      <h2 id="result-title">{t("result.title")}</h2>

      {degraded && (
        <p className="result-banner">
          {t("result.dataStatus", {
            climate: statusText(dataStatus.climate),
            soil: statusText(dataStatus.soil),
            terrain: statusText(dataStatus.terrain),
          })}
        </p>
      )}

      <div className="result-grid">
        <article className="result-card">
          <h3>{t("result.climate")}</h3>
          {climate ? (
            <>
              <p className="result-lead">
                {climate.koppen ? `${climate.koppen.code} · ${climate.koppen.name}` : t("result.noData")}
              </p>
              {climate.koppen && <p>{climate.koppen.explain}</p>}
              <dl>
                <dt>{t("result.annualTemp")}</dt>
                <dd>{fmt(climate.annualTempC)} °C</dd>
                <dt>{t("result.annualPrecip")}</dt>
                <dd>{fmt(climate.annualPrecipMm, 0)} mm</dd>
                <dt>{t("result.annualPet")}</dt>
                <dd>{fmt(climate.monthly.petMm.reduce((a, b) => a + b, 0), 0)} mm</dd>
                <dt>{t("result.growingSeason")}</dt>
                <dd>{fmt(climate.growingSeasonMonths, 0)}</dd>
                <dt>{t("result.frostFree")}</dt>
                <dd>{fmt(climate.frostFreeMonths, 0)}</dd>
              </dl>
              <small>
                {climate.source} · {t("result.samples", { n: climate.samples })}
              </small>
            </>
          ) : (
            <p>{t("result.noData")}</p>
          )}
        </article>

        <article className="result-card">
          <h3>{t("result.soil")}</h3>
          {soil ? (
            <>
              {soil.wrbGroup && <p className="result-lead">{soil.wrbGroup.name}</p>}
              <dl>
                <dt>{t("result.organicCarbon")}</dt>
                <dd>{median(soil.properties.organicCarbonGkg)} g/kg</dd>
                <dt>pH (H₂O)</dt>
                <dd>{median(soil.properties.phH2O)}</dd>
                <dt>{t("result.sand")}</dt>
                <dd>{median(soil.properties.sandPct)} %</dd>
                <dt>{t("result.silt")}</dt>
                <dd>{median(soil.properties.siltPct)} %</dd>
                <dt>{t("result.clay")}</dt>
                <dd>{median(soil.properties.clayPct)} %</dd>
              </dl>
              <small>{soil.source}</small>
            </>
          ) : (
            <p>{t("result.noData")}</p>
          )}
        </article>

        <article className="result-card">
          <h3>{t("result.terrain")}</h3>
          {terrain ? (
            <dl>
              <dt>{t("result.elevation")}</dt>
              <dd>{fmt(terrain.elevationM, 0)} m</dd>
              <dt>{t("result.slope")}</dt>
              <dd>{fmt(terrain.slopePct)} %</dd>
            </dl>
          ) : (
            <p>{t("result.noData")}</p>
          )}
        </article>
      </div>

      <h3>{t("result.recommendation")}</h3>
      {recommendation.warnings.map((warning) => (
        <p className="result-banner" key={warning}>
          {warning}
        </p>
      ))}

      <div className="result-grid">
        <article className="result-card result-sow">
          <h3>{t("result.sow")}</h3>
          <ul className="result-list">
            {recommendation.crops.map((crop) => (
              <li key={crop.id}>
                <strong>
                  {crop.sharePct}% {crop.name}
                </strong>{" "}
                · {crop.score}/100
                <p>{crop.why}</p>
              </li>
            ))}
          </ul>
          <small>{t("result.confidence", { level: t(`confidence.${recommendation.confidence}` as MessageKey) })}</small>
        </article>

        <article className="result-card result-avoid">
          <h3>{t("result.avoid")}</h3>
          {recommendation.avoid && recommendation.avoid.length > 0 ? (
            <ul className="result-list">
              {recommendation.avoid.map((crop) => (
                <li key={crop.id}>
                  <p>{crop.why}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("result.avoidNone")}</p>
          )}
        </article>
      </div>

      <h3>{t("result.strategies")}</h3>
      <div className="result-grid">
        <article className="result-card">
          <h3>{t("result.stress")}</h3>
          <ul className="result-list">
            {stress.map((item) => (
              <li key={item.id}>
                <span className={`result-dot result-dot-${item.level}`} aria-hidden="true" />
                <strong>{t(`stress.${item.id}` as MessageKey)}</strong> · {item.score}/100
              </li>
            ))}
          </ul>
        </article>

        {recommendation.strategies.map((strategy) => (
          <article className="result-card" key={strategy.id}>
            <h3>
              {strategy.title} · {strategy.score}/100
            </h3>
            <p>{strategy.summary}</p>
            {strategy.rotationPlan.length === 0 && strategy.dataGaps.map((gap) => <p key={gap}>{gap}</p>)}
            <ul className="result-list">
              {strategy.rotationPlan.map((year) => (
                <li key={year.year}>
                  <strong>{year.year}:</strong>{" "}
                  {year.blocks.map((block) => `${block.sharePct}% ${cropName(block.cropId)}`).join(", ")}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
