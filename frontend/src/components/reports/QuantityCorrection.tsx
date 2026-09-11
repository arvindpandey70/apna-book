import React from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock } from "lucide-react";

const QuantityCorrection: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();

  return (
    <div
      className={`pt-[56px] px-4 min-h-screen ${
        theme === "dark" ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-900"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          title="Back to Reports"
          onClick={() => navigate("/app/reports")}
          className={`p-2 rounded-full transition-colors ${
            theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
          }`}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">Quantity Correction</h1>
      </div>

      {/* Simple Working Indicator Card */}
      <div
        className={`p-12 rounded-xl border text-center shadow-sm max-w-lg mx-auto mt-12 ${
          theme === "dark"
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="flex justify-center mb-4 text-blue-500">
          <Clock size={48} className="animate-spin-slow" />
        </div>
        <h2 className="text-xl font-bold mb-2">Working...</h2>
        <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
          Quantity Correction module is currently in progress.
        </p>
      </div>
    </div>
  );
};

export default QuantityCorrection;
