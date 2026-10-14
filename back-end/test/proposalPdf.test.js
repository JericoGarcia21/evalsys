const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const childProcess = require('node:child_process');

test('proposal previews preserve PDFs, reject invalid files, convert office documents and clean up', async () => {
  let directory;
  let unavailable = false;
  const command = mock.method(childProcess, 'execFile', (executable, args, options, callback) => {
    directory = args[args.indexOf('--outdir') + 1];
    assert.equal(options.timeout, 60000);
    assert.equal(options.windowsHide, true);
    assert.ok(args.includes('--headless'));
    assert.ok(args[0].startsWith('-env:UserInstallation=file:'));
    if (unavailable) {
      const error = Object.assign(new Error('missing executable'), { code: 'ENOENT', syscall: 'spawn soffice' });
      callback(error);
      return;
    }
    fs.writeFile(path.join(directory, 'proposal.pdf'), '%PDF-1.4 converted')
      .then(() => callback(null, '', ''), callback);
  });
  try {
    const { convertProposalToPdf } = require('../src/services/proposalPdf.service');
    const pdf = Buffer.from('%PDF-1.4 original');
    assert.equal(await convertProposalToPdf(pdf, 'proposal.PDF'), pdf);
    await assert.rejects(convertProposalToPdf(Buffer.from('bad'), 'proposal.pdf'), /Invalid PDF/);
    await assert.rejects(convertProposalToPdf(Buffer.from('bad'), 'proposal.exe'), /Unsupported/);
    for (const extension of ['doc', 'docx', 'ppt', 'pptx']) {
      const output = await convertProposalToPdf(Buffer.from('office document'), '../../uploaded.' + extension);
      assert.equal(output.toString(), '%PDF-1.4 converted');
      await assert.rejects(fs.access(directory), { code: 'ENOENT' });
    }
    unavailable = true;
    await assert.rejects(convertProposalToPdf(Buffer.from('office document'), 'proposal.docx'),
      error => error.status === 503 && /Install LibreOffice/.test(error.message));
    await assert.rejects(fs.access(directory), { code: 'ENOENT' });
  } finally {
    command.mock.restore();
  }
});
