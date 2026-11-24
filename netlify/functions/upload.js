exports.handler = async (event) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const json = (o, s) => ({ statusCode: s || 200, headers: cors, body: JSON.stringify(o) });
  if (!token || !chat) return json({ error: "no_env" }, 500);

  const ct = ((event.headers["content-type"] || event.headers["Content-Type"] || "") + "").toLowerCase();
  let buf, name, mime;

  if (ct.indexOf("application/json") >= 0) {
    let body = event.body;
    if (event.isBase64Encoded) body = Buffer.from(body, "base64").toString("utf8");
    let p;
    try { p = JSON.parse(body); } catch (e) { return json({ error: "bad_json" }, 400); }
    if (!p.file) return json({ error: "empty" }, 400);
    buf = Buffer.from(p.file, "base64");
    name = p.name || "track.mp3";
    mime = p.mime || "audio/mpeg";
  } else {
    buf = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "binary");
    name = event.headers["x-filename"] || event.headers["X-Filename"] || "track.mp3";
    mime = ct || "audio/mpeg";
  }

  name = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").slice(0, 180);
  if (!buf || !buf.length) return json({ error: "empty" }, 400);

  const fd = new FormData();
  fd.append("chat_id", chat);
  fd.append("document", new Blob([buf], { type: mime }), name);

  let r;
  try {
    r = await fetch("https://api.telegram.org/bot" + token + "/sendDocument", { method: "POST", body: fd });
  } catch (e) {
    return json({ error: "fetch_fail" }, 502);
  }
  const j = await r.json().catch(() => ({}));
  if (!j.ok || !j.result || !j.result.document)
    return json({ error: (j.description || "tg"), status: r.status }, 502);

  return json({ fileId: j.result.document.file_id, size: j.result.document.file_size || buf.length });
};
