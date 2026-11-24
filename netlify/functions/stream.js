exports.handler = async (event) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const q = event.queryStringParameters || {};
  const fileId = q.fileId;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store"
  };
  if (!token || !fileId) return { statusCode: 400, headers: cors, body: "bad_request" };

  const CAP = 5 * 1024 * 1024;

  let meta;
  try {
    const r = await fetch("https://api.telegram.org/bot" + token + "/getFile?file_id=" + encodeURIComponent(fileId));
    meta = await r.json();
  } catch (e) {
    return { statusCode: 502, headers: cors, body: "get_file_fail" };
  }
  if (!meta.ok || !meta.result || !meta.result.file_path)
    return { statusCode: 502, headers: cors, body: "tg_get_file" };

  const total = meta.result.document ? meta.result.document.file_size : 0;
  const cdn = "https://api.telegram.org/file/bot" + token + "/" + meta.result.file_path;
  const range = event.headers.range || event.headers.Range || "";

  let upstreamHeaders = {};
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    let start = m ? +m[1] : 0;
    let end = m && m[2] ? +m[2] : start + CAP - 1;
    if (end - start + 1 > CAP) end = start + CAP - 1;
    if (total && end >= total) end = total - 1;
    upstreamHeaders = { Range: "bytes=" + start + "-" + end };
  } else if (total && total > CAP) {
    upstreamHeaders = { Range: "bytes=0-" + (CAP - 1) };
  }

  let up;
  try {
    up = await fetch(cdn, { headers: upstreamHeaders });
  } catch (e) {
    return { statusCode: 502, headers: cors, body: "download_fail" };
  }
  if (!up.ok && up.status !== 206)
    return { statusCode: 502, headers: cors, body: "tg_download" };

  const ab = await up.arrayBuffer();
  const h = Object.assign({}, cors);
  const mp = q.mime || "";
  const SAFE_MIME = /^(audio\/(mpeg|mp4|ogg|opus|flac|wav|aac|x-wav|x-flac|wave)|image\/(jpeg|png|webp|gif))$/;
  h["Content-Type"] = SAFE_MIME.test(mp) ? mp : (up.headers.get("content-type") || "audio/mpeg");
  const cr = up.headers.get("content-range");
  if (cr) h["Content-Range"] = cr;
  h["Content-Length"] = String(ab.byteLength);

  return {
    statusCode: up.status,
    headers: h,
    body: Buffer.from(ab).toString("base64"),
    isBase64Encoded: true
  };
};
