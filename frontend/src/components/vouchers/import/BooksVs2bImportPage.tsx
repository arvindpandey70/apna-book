import React from "react";
import { Navigate } from "react-router-dom";

const BooksVs2bImportPage: React.FC = () => {
  return <Navigate to="/app/vouchers/import/gstr2a-vs-gstr2b" replace />;
};

export default BooksVs2bImportPage;
