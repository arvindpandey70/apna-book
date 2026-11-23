import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../../context/AppContext";
import ReportImportSection from "./ReportImportSection";

const Form26AsImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useAppContext();

  return (
    <main
      className={`p-4 md:p-6 min-h-screen ${
        theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"
      }`}
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/app/reports/books-vs-26as")}
            className={`p-2 rounded-lg border transition-colors ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 border-gray-700"
                : "bg-white hover:bg-gray-100 border-gray-200 shadow-sm"
            }`}
            aria-label="Back to Books vs 26AS report"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold">Form 26AS Import</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Upload Form 26AS / tax credit statement to reconcile with Books TDS
            </p>
          </div>
        </div>

        <ReportImportSection
          initialReportType="26as"
          theme={theme}
          neutralTheme
          focusedOnly
        />
      </div>
    </main>
  );
};

export default Form26AsImportPage;
