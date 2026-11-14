import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { AnalyzeResponse } from "@field-shift/shared";
import mock from "@field-shift/shared/mock-analyze.json";
import { FieldMap } from "./FieldMap";
createRoot(document.getElementById("map-root")!).render(<StrictMode><FieldMap analysis={mock as AnalyzeResponse} /></StrictMode>);
