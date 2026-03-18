---
name: a11y-diagram-generator
description: |
  Generates technical diagrams including flowcharts, sequence diagrams, UML, architecture diagrams (AWS/Azure), ERD, BPMN, mindmaps, and UI prototypes. Use when the user requests visual representations of systems, processes, workflows, or designs. Supports iterative refinement based on feedback.

  Also supports:
  - **Accessibility testing result diagrams**: Score breakdowns, impact/category distributions, compliance overviews, issue severity flows, and dashboards derived from accessibility audit results (from MCP tools such as audit_url, audit_multiple_urls).
  - **Excel or Word reports from audit results**: Use the same audit result data to generate downloadable DOCX or XLSX reports with summary metrics, a single issues table (Rule ID, Category, Impact, WCAG Level, Description, Element, XPath, User Impact, Fix Explanation), compliance breakdown, and optional charts. Prefer MCP export tools (e.g. export_to_excel, export_to_html_report) when available; otherwise use Code Executor with python-docx/openpyxl and the audit result object as the data source.
---

# Diagram Generator

## Overview

Generate high-quality technical diagrams tailored to user requirements. Supports multiple diagram types with clarity, precision, and fidelity to requested styles. **Accessibility testing result diagrams** and **Excel/Word reports from audit results** use MCP accessibility audit data (e.g. `audit_url`, `audit_multiple_urls`) as the source; when the user asks for a report (Word or Excel) from an audit, use audit results to populate tables and charts, and provide a download link.

## Supported Diagram Types

- **Flowchart**: Process flows and decision trees
- **Sequence Diagram**: Component interactions over time
- **UML Diagram**: Class diagrams, use cases, activity diagrams
- **Architecture Diagram**: AWS or Azure infrastructure layouts
- **High-Level Design (HLD)**: System architecture overview
- **Low-Level Design (LLD)**: Detailed component design
- **Process Flow Diagram**: Business process workflows
- **Entity Relationship Diagram (ERD)**: Database schemas
- **BPMN Diagram**: Business process modeling notation
- **Mindmap**: Hierarchical concept visualization
- **Mobile/Webpage Prototype**: UI screen layouts
- **Accessibility testing result diagrams**: Score gauges, impact/category bar charts, compliance breakdown, issue severity flow (violations → recommendations), dashboard-style visuals from audit result `summary` and `prioritizedIssues`
- **Custom Diagram**: Request clarification for unique formats

## Instructions

### Step 1: Collect Requirements

Ask the user to specify:

**Diagram Type:**
- "What type of diagram do you need?" (flowchart, UML, sequence, architecture, **accessibility result diagram**, etc.)

**Content Details:**
- For flowcharts: "What processes or steps should be included?"
- For UML: "What relationships need to be illustrated?"
- For architecture: "What level of detail should be captured?"
- For prototypes: "Is this for mobile or webpage? What UI components are needed?"
- **For accessibility result diagrams or reports:** "Do you have an audit result (e.g. from a URL), or should I run an audit first?" If no audit yet, use MCP tools (e.g. `audit_url`) to obtain the result. For **Excel or Word reports**, ask: "Do you prefer Word (DOCX) or Excel (XLSX), or both?"

**Key Elements:**
- Components, processes, relationships, annotations
- Data entities, workflows, system boundaries
- Specific formatting or notation requirements
- **For audit-based outputs:** Summary (score, total issues, WCAG A/AA/AAA %), issues table (one table, all columns), compliance breakdown, charts (by impact, by category)

### Step 2: Obtain Audit Data (for accessibility diagrams or reports)

When generating **accessibility testing result diagrams** or **Excel/Word reports from audit results**:

1. **Get audit result:** Use MCP tools: `audit_url` (single URL) or `audit_multiple_urls` (batch). Pass `tags` (e.g. `["wcag22aa", "best-practice"]`) and optional `basicAuthUsername`/`basicAuthPassword` for protected pages.
2. **Optional:** Use `export_to_excel` or `export_to_html_report` if the user only needs the MCP server’s built-in export; otherwise use the audit result object to build custom Word/Excel via Code Executor (python-docx, openpyxl).
3. **Data to use:** From the result: `summary` (totalIssues, score, wcagCompliance, byCategory, byImpact), `prioritizedIssues` (ruleId, impact, description, wcagLevel, element, xpath, userImpact, fix.explanation). Sort issues descending: critical → serious → moderate → minor, then recommendations.

### Step 3: Generate Diagram or Report

**For standard diagrams:**
- Use appropriate syntax or tool (Mermaid, PlantUML, etc.)
- Preserve fidelity to requested format and style
- Ensure visual clarity and structural accuracy

**For accessibility result diagrams:**
- **Score/gauge:** Single number or gauge from `summary.score`
- **Impact/category charts:** Bar or pie charts from `summary.byImpact`, `summary.byCategory`
- **Compliance:** A/AA/AAA percentages from `summary.wcagCompliance`
- **Issue flow:** High-level flow from violations (critical/serious) to recommendations (minor/best-practice)
- Use Mermaid (e.g. bar chart representation, flowchart for severity flow) or generate image with matplotlib in Code Executor and embed

**For Excel (XLSX) reports from audit results:**
- **Summary sheet:** totalIssues, score, wcagCompliance (A, AA, AAA %), optional byCategory/byImpact summary
- **Issues sheet:** One table with columns — **Number**, **Rule ID**, **Category**, **Impact**, **WCAG Level**, **Description**, **Element (class selector)**, **XPath**, **User Impact**, **Fix Explanation**. Sort rows by impact (critical → serious → moderate → minor), then by WCAG level, then recommendations last.
- **Charts sheet (optional):** Bar charts for byImpact and byCategory
- Use MCP `export_to_excel` when available, or Code Executor with openpyxl and the audit result object

**For Word (DOCX) reports from audit results:**
- **Sections:** Title → Executive summary (score, issue count, compliance %) → Issues table (same columns as above, same sort order) → Compliance breakdown → Optional charts (by impact, by category) → Conclusions
- Use Code Executor with python-docx and the audit result object; insert tables and optionally embed chart images (matplotlib)

**Provide supporting documentation:**
- Brief summary describing diagram/report components
- Explanation of relationships and purpose
- For reports: provide a **download link** to the generated DOCX or XLSX file

**Present output:**

```
Your [diagram type / report] has been created based on the provided specifications [and audit results].
[Download: link to .xlsx or .docx if applicable]
Please review and provide feedback.
```

### Step 4: Refine Based on Feedback

**Collect feedback:**
- "Does the diagram/report accurately reflect your requirements?"
- "Would you like to add any annotations or components?"
- "Are there any corrections needed?"

**Incorporate changes:**
- Update diagram or report and supporting text per user feedback
- Return revised version for confirmation
- Iterate until requirements are met

## Accessibility Result Diagrams and Reports (Detail)

### Data source

- **From MCP:** Audit result object returned by `audit_url`, `audit_multiple_urls`, or `audit_with_session`. Contains `summary`, `prioritizedIssues`, `quickWins`, `criticalBlockers`, and optionally `metadata`.

### Issues table (for Excel/Word reports)

Use **one table** with columns in this order:

| Column              | Source / note |
|---------------------|----------------|
| Number              | 1-based index  |
| Rule ID             | `ruleId`       |
| Category            | From result/tags |
| Impact              | `impact` (critical/serious/moderate/minor) |
| WCAG Level          | `wcagLevel` or tags |
| Description         | `description`  |
| Element (class selector) | `element`; prefer class selector when available |
| XPath               | `xpath`       |
| User Impact         | `userImpact`  |
| Fix Explanation     | `fix.explanation` |

**Ordering:** Descending from violations to recommendations: critical → serious → moderate → minor; within same impact, by WCAG level (A, AA, AAA), then best-practice/recommendations last.

### When to use MCP export vs Code Executor

- **Prefer MCP:** If the user only needs a standard Excel or HTML export, call `export_to_excel` or `export_to_html_report` with the audit result (or URL) and share the returned file/link.
- **Use Code Executor:** When the user wants Word (DOCX), custom layout, extra sections, or specific chart styling; use the audit result object in Python (python-docx, openpyxl, matplotlib) to build the document and provide a download link.

## Examples

### Example 1: Flowchart for User Authentication

**User says:** "Create a flowchart for user login process"

**Questions:**
- "What authentication methods should be included? (password, OAuth, MFA)"
- "Should it handle error cases like invalid credentials or account lockout?"

**Output:** Mermaid flowchart with start/end nodes, decision diamonds, process boxes, and supporting text.

### Example 2: Accessibility result diagram and Excel report

**User says:** "Show me an accessibility diagram and an Excel report for https://example.com"

**Steps:**
1. Call `audit_url` with url `https://example.com` and tags e.g. `["wcag22aa", "best-practice"]`.
2. **Diagram:** Generate a Mermaid or image diagram: score gauge, bar chart of byImpact, bar chart of byCategory, and optional severity flow (violations → recommendations).
3. **Report:** Call `export_to_excel` with the audit result (or the same URL), or use Code Executor with openpyxl to build an XLSX with Summary sheet, Issues table (all columns, sorted), and optional Charts sheet. Provide download link.

**Output:** Diagram (inline or image) + "Excel report generated. Download: [filename.xlsx]"

### Example 3: Word report from audit results

**User says:** "Generate a Word report for the accessibility audit of example.com"

**Steps:**
1. Obtain audit result via `audit_url` for the URL.
2. Use Code Executor: import python-docx (and optionally matplotlib); create Document; add title and executive summary (score, total issues, WCAG %); add Issues table with columns Number, Rule ID, Category, Impact, WCAG Level, Description, Element, XPath, User Impact, Fix Explanation (rows sorted violations first); add compliance breakdown and optional charts; save as .docx.
3. Provide download link to the .docx file.

## Troubleshooting

### Issue: Unclear or incomplete requirements

**Solution:** Ask targeted questions about missing elements:
- "What components are involved in this process?"
- "How do these elements interact?"
- "For accessibility reports: which URL(s) should be audited, and do you prefer Word or Excel?"

### Issue: Diagram or report too complex or cluttered

**Solution:** Suggest decomposition:
- "Would you like to break this into multiple diagrams?"
- "Should we create a high-level overview first?"
- "For reports: should we include all issues or only critical/serious?"

### Issue: No audit result for accessibility outputs

**Solution:** Run an audit first:
- "I'll run an accessibility audit for [URL] and then generate the diagram/report."
- Use `audit_url` or `audit_multiple_urls`; if the user provided a result object, use it directly.

### Issue: Format or notation unclear

**Solution:** Clarify standards:
- "Should this follow UML 2.0 notation?"
- "Do you prefer Word (DOCX) or Excel (XLSX) for the report?"
- "Are there specific styling requirements for the issues table?"

## Constraints

**Preserve original format:**
- Maintain requested diagram type and notation
- Do not apply unnecessary modifications
- Follow standard conventions for chosen format

**Clarity and precision:**
- Ensure diagrams and reports are visually clear
- Maintain structural accuracy; for issues table, use one table with required columns and correct sort order
- Use consistent styling and labeling

**Audit-based outputs:**
- Use audit result object (or URL to trigger audit) as the single source of truth; do not invent data
- For Excel/Word reports, include the full issues table with columns Number, Rule ID, Category, Impact, WCAG Level, Description, Element (class selector), XPath, User Impact, Fix Explanation; order descending from violations to recommendations

**User-centric approach:**
- Prioritize user requirements
- Address all feedback and requests
- Confirm understanding before generating

**Error handling:**
- Notify user of incomplete or unclear input
- Request clarification before proceeding
- Explain limitations if format is unsupported

## Use Cases

- Design workflows and system processes
- Document software architectures
- Create database schemas
- Model business processes
- Generate UI/UX prototypes
- Visualize cloud infrastructure
- **Visualize accessibility audit results** (score, impact/category, compliance, severity flow)
- **Generate Excel or Word reports from accessibility audit results** (summary, issues table, compliance, charts)
- Produce technical documentation diagrams
- Support academic or professional presentations
