---
name: docs-report-generation
description: |
  Use this skill when you need to:
  - Convert data analysis or reports into professional DOCX or XLSX documents
  - Create Word (DOCX) or Excel (XLSX) reports with tables, headers, and styled content
  - Generate downloadable documentation for stakeholders or clients
  - Produce standardized report templates with consistent formatting
  - Transform structured data (cost estimates, metrics, analysis results) into polished documents
  - Create technical documentation, executive summaries, or business reports
  - Generate accessibility audit reports (Word or Excel) from MCP audit results

  The skill uses Code Executor Tool with python-docx (DOCX) and openpyxl or xlsxwriter (Excel) to generate well-formatted documents and spreadsheets. When generating accessibility reports, use audit results from accessibility MCP tools (e.g. audit_url, get_quick_fixes, get_wcag_compliance) as the data source; then produce DOCX or XLSX with summary, issues table, compliance breakdown, and optional charts. A download link is provided for the generated file.
---

## Purpose

Generate professional **DOCX (Word)** and **XLSX (Excel)** reports with tables, charts, and graphs using Code Executor Tool. Use **python-docx** and **matplotlib** for Word; use **openpyxl** (or **xlsxwriter**) and optionally **matplotlib** for Excel. Reports can be driven by **audit results** (e.g. accessibility audit output from MCP tools): summary metrics, issues table (Rule ID, Category, Impact, WCAG Level, Description, Element, XPath, User Impact, Fix Explanation), compliance breakdown, and charts.

## Context

Use when creating:

- **General reports:** Analysis reports with visualizations; professional documents with charts, graphs, and tables; data-driven reports; standardized templates with graphics.
- **Audit-based reports:** Accessibility (or other) audit reports from MCP tool results: include summary (score, total issues, WCAG compliance %), a single issues table (ordered from violations to recommendations), compliance breakdown, and optional charts (e.g. by impact, by category). Output as Word or Excel.

## Instructions

1. **Gather Data**
   - For **general reports:** Collect title, metadata, sections, numerical data, tables, and conclusions.
   - For **audit reports:** Use the audit result object from MCP tools (e.g. `audit_url`, `audit_multiple_urls`). Extract `summary` (totalIssues, score, wcagCompliance, byCategory, byImpact), `prioritizedIssues` (ruleId, impact, description, wcagLevel, element, xpath, userImpact, fix.explanation), and optionally `quickWins` and `criticalBlockers`. Decide output format: **Word (DOCX)** or **Excel (XLSX)**.

2. **Plan Visuals**
   - Trends → Line charts  
   - Comparisons → Bar charts  
   - Proportions → Pie charts  
   - Distributions → Histograms  
   - Relationships → Scatter plots  
   - Structured data / issues list → Tables  
   - For audit reports: consider bar charts for byImpact and byCategory; issues in one table with columns: Number, Rule ID, Category, Impact, WCAG Level, Description, Element (class selector), XPath, User Impact, Fix Explanation. Sort issues descending by severity (violations first, then recommendations).

3. **Structure Report**
   - **Word:** Title page → Executive summary → Content sections with visuals → Tables → Conclusions → Appendices (optional).  
   - **Excel:** Summary sheet (metrics, compliance) → Issues sheet (one table, all columns above) → optional Charts sheet or embedded charts.  
   - **Audit reports:** Summary (score, total issues, WCAG A/AA/AAA %) → Issues table (one table, sorted) → Compliance breakdown → Optional charts (impact/category).

4. **Execute Python Code**
   - **Word (DOCX):** Use Code Executor Tool to import python-docx, matplotlib, pandas; create Document; add styled headers; generate and save charts as images; insert images and formatted tables; apply consistent formatting; save as .docx.
   - **Excel (XLSX):** Use Code Executor Tool to import openpyxl (or xlsxwriter), optionally matplotlib/pandas; create workbook; add Summary sheet with metrics and compliance; add Issues sheet with headers and data rows (Number, Rule ID, Category, Impact, WCAG Level, Description, Element, XPath, User Impact, Fix Explanation); apply table styling, column widths, optional conditional formatting; add charts (e.g. bar charts from byImpact/byCategory); save as .xlsx.

5. **Apply Formatting**
   - **Word:** Consistent fonts (Calibri/Arial), heading styles, table borders and shading, chart sizing and captions, page breaks.
   - **Excel:** Bold headers, column widths, table style, optional alternating row colors; chart sheets or embedded charts; clear sheet names (e.g. Summary, Issues, Charts).

6. **Provide Download Link**  
   Share a clickable link to the generated DOCX or XLSX file.

## Examples

**Cost Report (Word):** Pie chart (cost breakdown), bar chart (regional comparison), line chart (trends), formatted tables  
→ Download: [Cost_Report_Visual_2026-02-17.docx]

**Performance Report (Word):** KPI bar charts, trend lines, conditional formatting tables  
→ Download: [Performance_Dashboard_Q1_2026.docx]

**Accessibility Audit Report (Word):** Summary (score, issues count, WCAG %), single issues table (Rule ID, Category, Impact, WCAG Level, Description, Element, XPath, User Impact, Fix Explanation) from MCP audit result, bar charts (by impact, by category), conclusions  
→ Download: [Accessibility_Report_example_com_2026-03-12.docx]

**Accessibility Audit Report (Excel):** Summary sheet (score, total issues, WCAG A/AA/AAA %), Issues sheet (full table, sorted violations → recommendations), Charts sheet (by impact, by category)  
→ Download: [Accessibility_Report_example_com_2026-03-12.xlsx]

**Financial Summary (Word):** Revenue pie chart, stacked bars, color-coded tables  
→ Download: [Financial_Report_2026-02-17.docx]

## Best Practices

**Technical**

- **Word:** `pip install python-docx matplotlib pandas pillow`  
  Charts as PNG (150+ DPI), embed in document. Image width 5–6" (portrait max 6.5", landscape max 9").
- **Excel:** `pip install openpyxl matplotlib pandas` (or `xlsxwriter` for more chart options).  
  Use openpyxl for tables and data; generate charts with matplotlib, save as image and insert, or use openpyxl chart API where supported.
- Use consistent, colorblind-friendly colors and matplotlib style sheets.

**Design**

- Choose appropriate chart types; keep them simple.
- Use 3–5 consistent colors; add clear labels, titles, legends, and captions.
- Format tables: bold headers, alternating rows, borders. For audit issues table, include all required columns and sort by severity (violations first, then recommendations).
- Descriptive filenames with dates.

**Accessibility**

- Use patterns in addition to colors in charts.
- Add alt text / descriptions where the format allows.
- Summarize large datasets before visualization.

**Audit reports from MCP**

- Use the audit result object as the single source of truth (do not invent data).
- Issues table: one table, columns Number, Rule ID, Category, Impact, WCAG Level, Description, Element (class selector), XPath, User Impact, Fix Explanation; order descending from violations to recommendations (e.g. critical → serious → moderate → minor, then best-practice).
- Offer both Word and Excel when the user does not specify format.
