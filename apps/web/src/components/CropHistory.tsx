import type { CropOption, Lang } from "@field-shift/shared";
import { translate, type MessageKey } from "../i18n";

type Props = {
  lang: Lang;
  crops: CropOption[];
  /** Three years, oldest first. */
  years: number[];
  /** Crop ids per year; "unknown" and "fallow" are the special ids of the contract. */
  value: string[][];
  onChange: (value: string[][]) => void;
};

/** One main crop and an optional second crop for each of the last three years. */
export function CropHistory({ lang, crops, years, value, onChange }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const sorted = [...crops].sort((a, b) => a.name[lang].localeCompare(b.name[lang], lang));

  const setYear = (index: number, first: string, second: string) => {
    const next = value.map((year) => [...year]);
    // "unknown" and "fallow" describe the whole year, so a second crop makes no sense with them.
    const special = first === "unknown" || first === "fallow";
    next[index] = special || !second || second === first ? [first] : [first, second];
    onChange(next);
  };

  return (
    <div className="history-grid">
      {years.map((year, index) => {
        const [first, second = ""] = value[index];
        const special = first === "unknown" || first === "fallow";
        return (
          <fieldset className="history-year" key={year}>
            <legend>{t("history.year", { year })}</legend>
            <select aria-label={t("history.year", { year })} value={first} onChange={(e) => setYear(index, e.target.value, second)}>
              <option value="unknown">{t("history.unknown")}</option>
              <option value="fallow">{t("history.fallow")}</option>
              {sorted.map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {crop.icon} {crop.name[lang]}
                </option>
              ))}
            </select>
            <label>
              {t("history.second")}
              <select value={second} disabled={special} onChange={(e) => setYear(index, first, e.target.value)}>
                <option value="">{t("history.none")}</option>
                {sorted
                  .filter((crop) => crop.id !== first)
                  .map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {crop.icon} {crop.name[lang]}
                    </option>
                  ))}
              </select>
            </label>
          </fieldset>
        );
      })}
    </div>
  );
}
