import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { exportRequirements } from "../api/traceability";
import { Icon, Alert } from "../components/UI";
import { downloadBlob } from "../utils/helpers";

const EXPORTS = [
  {
    format: "word",
    title: "Word Document",
    sub: "IEEE 29148 formatted .docx",
    desc: "Full SRS document with cover page, introduction, requirements table, and traceability matrix. Ready for stakeholder review.",
    ext: "docx",
  },
  {
    format: "excel",
    title: "Excel Spreadsheet",
    sub: "3-sheet .xlsx workbook",
    desc: "Requirements sheet, QA issues sheet, and summary statistics. Includes all scoring data and filtering.",
    ext: "xlsx",
  },
  {
    format: "json",
    title: "JSON",
    sub: "Structured .json export",
    desc: "Machine-readable export with full metadata. Compatible with Jira, DOORS, and other requirement management tools.",
    ext: "json",
  },
];

export function ExportPage({ project }) {
  const { token } = useAuth();
  const [loadingMap, setLoadingMap] = useState({});
  const [error, setError] = useState("");

  const download = async (format, ext) => {
    setLoadingMap((prev) => ({ ...prev, [format]: true }));
    setError("");
    try {
      const blob = await exportRequirements(project.id, format, token);
      downloadBlob(
        blob,
        `${project.name.replace(/ /g, "_")}_requirements.${ext}`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [format]: false }));
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <div className="page-title">Export</div>
          <div className="page-sub">
            Download requirements in various formats · {project.name}
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {EXPORTS.map((ex) => (
          <div
            key={ex.format}
            className="card"
            style={{ display: "flex", flexDirection: "column" }}
          >
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 17,
                  fontWeight: 400,
                  fontStyle: "italic",
                  marginBottom: 2,
                }}
              >
                {ex.title}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--ink-3)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {ex.sub}
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                lineHeight: 1.6,
                flex: 1,
                marginBottom: 20,
              }}
            >
              {ex.desc}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => download(ex.format, ex.ext)}
              disabled={loadingMap[ex.format]}
            >
              {loadingMap[ex.format] ? (
                <span className="spinner" />
              ) : (
                <Icon name="download" size={14} />
              )}
              Download {ex.title}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
