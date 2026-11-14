
import type { Lang } from "@field-shift/shared";
import { translate, type MessageKey } from "../i18n";

type Props = {
  lang: Lang;
};

export function FieldSelection({ lang }: Props) {
  const t = (key: MessageKey) => translate(lang, key);

  return (
    <section className="field-section" aria-labelledby="field-title">
      <div className="field-section-heading">
        <span className="field-eyebrow">{t("field.step")}</span>
        <h2 id="field-title">{t("field.title")}</h2>
        <p>{t("field.description")}</p>
      </div>

      <div className="field-layout">
        <div className="field-map-placeholder">
          {/* Replace this placeholder with FieldMap when map integration is ready. */}
          <div className="map-placeholder-content">
            <span className="map-placeholder-icon" aria-hidden="true">◎</span>
            <strong>{t("field.mapTitle")}</strong>
            <p>{t("field.mapPending")}</p>
          </div>
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
            <strong>{t("field.pendingTitle")}</strong>
            <p>{t("field.pendingDescription")}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
