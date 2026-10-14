const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const run = (executable, args, options) => new Promise((resolve, reject) => {
  execFile(executable, args, options, (error) => error ? reject(error) : resolve());
});
const officeExtensions = new Set(['.doc', '.docx', '.ppt', '.pptx']);

const convertProposalToPdf = async (buffer, originalName) => {
  const extension = path.extname(originalName || '').toLowerCase();
  if (extension === '.pdf') {
    if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF document');
    return buffer;
  }
  if (!officeExtensions.has(extension)) throw new Error('Unsupported proposal format');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'evalsys-proposal-'));
  try {
    const input = path.join(directory, 'proposal' + extension);
    await fs.writeFile(input, buffer);
    const executable = process.env.LIBREOFFICE_PATH || (process.platform === 'win32'
      ? 'C:/Program Files/LibreOffice/program/soffice.exe' : 'soffice');
    await run(executable, [
      '-env:UserInstallation=' + pathToFileURL(path.join(directory, 'profile')).href,
      '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', directory, input,
    ], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
    const pdf = await fs.readFile(path.join(directory, 'proposal.pdf'));
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF conversion failed');
    return pdf;
  } catch (error) {
    if (error.code === 'ENOENT' && error.syscall?.startsWith('spawn')) {
      const unavailable = new Error('PDF conversion is unavailable. Install LibreOffice on the API server and configure LIBREOFFICE_PATH.');
      unavailable.status = 503;
      throw unavailable;
    }
    throw new Error('Unable to convert this proposal to PDF. Please check the document and try again.');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

module.exports = { convertProposalToPdf };
