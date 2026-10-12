# Draft exports and progress states

Job toolkit and the writing desk offer DOCX, PDF and TXT downloads of the current edited draft. Exports use the selected uploaded document as a template, or the latest upload of the same type. Only the owner can use a document template. Files are rendered locally; the renderer never sends your draft to an external conversion service.

For DOCX templates, exports retain document styles, page settings, table structure, headers, footers and embedded drawings. Draft paragraphs replace body text in template order, and additional paragraphs inherit a body style. Inline emphasis can change when prose is rewritten; changed content can change pagination. Choose a template with the same section structure as your draft and review the result.

PDF templates provide detected page size, typography and colors for a new editable document. Fixed PDF columns, graphics and exact coordinates cannot be reliably reconstructed. Upload the original DOCX when preserving that structure matters. Plain-text templates have no styling, so a readable default layout is used. These limits appear in the export UI and in download status messages. PDF output is rendered with local LibreOffice and installed Liberation/DejaVu fonts; unavailable fonts may be substituted.

Rendering uses a separate temporary directory and office profile for each request, with macro security at its highest level and external template relationships removed. Export requests are authenticated, origin-checked and limited. Original uploads and saved drafts are not overwritten. Review all generated content before submitting it.

Page loading, job searches, uploads, saves, exports and AI requests show progress indicators. AI operations disable duplicate generation controls. Indicators are indeterminate because the provider does not report a reliable percentage; reduced-motion preferences disable their animation.

References: [python-docx paragraph formatting](https://python-docx.readthedocs.io/en/latest/_modules/docx/text/paragraph.html), [LibreOffice PDF export](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html).
