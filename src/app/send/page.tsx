"use client";

import { useState } from "react";
import Peer, { DataConnection } from "peerjs";

export default function SendPage() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [error, setError] = useState<string | null>(null);
  const [conn, setConn] = useState<DataConnection | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const handleConnect = () => {
    setError(null);
    setStatus("Connecting…");

    const peer = new Peer();

    peer.on("open", () => {
      const connection = peer.connect(code);

      connection.on("open", () => {
        setStatus(`Connected to ${code}`);
        setConn(connection);
      });

      connection.on("error", (err) => {
        setError(err.message);
        setStatus("Connection error");
      });
    });

    peer.on("error", (err) => {
      setError(err.message);
      setStatus("Peer error");
    });
  };

const handleSend = () => {
  if (!conn || !file) return;
  setSending(true);
  setStatus(`Sending ${file.name}…`);

  const CHUNK_SIZE = 64 * 1024; // 64KB is safer than 16KB for WebRTC [citation:6][citation:9]
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  conn.send({
    type: "metadata",
    name: file.name,
    size: file.size,
    mime: file.type,
    totalChunks,
  });

  // Access the raw RTCDataChannel. This is the critical part.
  const dataChannel = (conn as any).dataChannel as RTCDataChannel | undefined;

  if (!dataChannel) {
    setError("Cannot access data channel for backpressure control.");
    setSending(false);
    return;
  }

  // Set the low threshold. When buffer drops below this, 'bufferedamountlow' fires.
  dataChannel.bufferedAmountLowThreshold = 1024 * 1024; // 1MB [citation:9][citation:12]

  let offset = 0;
  let chunkIndex = 0;
  const reader = new FileReader();

  // This function sends ONE chunk, then waits for the channel to be ready.
  const sendNextChunk = () => {
    if (offset >= file.size) {
      setStatus(`Sent ${file.name}`);
      setSending(false);
      return;
    }

    // If buffer is too full, wait for the 'bufferedamountlow' event.
    // Do NOT use setTimeout here. The event will trigger the next send.
    if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
      // The listener was attached once in the setup below.
      return;
    }

    const slice = file.slice(offset, offset + CHUNK_SIZE);
    reader.readAsArrayBuffer(slice);
  };

  // When the file slice is read, send it, then try the next one.
  reader.onload = () => {
    const buffer = reader.result as ArrayBuffer;

    try {
      conn.send({ type: "chunk", index: chunkIndex, data: buffer });
    } catch (err) {
      setError("Send failed — connection lost");
      setSending(false);
      return;
    }

    chunkIndex++;
    offset += CHUNK_SIZE;

    setStatus(
      `Sending ${file.name}… ${Math.min(offset, file.size)} / ${file.size} bytes`
    );

    // Try to send the next chunk immediately. If buffer is full, the
    // 'bufferedamountlow' listener will resume the loop.
    sendNextChunk();
  };

  reader.onerror = () => {
    setError("Failed to read file");
    setSending(false);
  };

  // Attach the listener ONCE. It fires whenever the buffer drains below threshold.
  dataChannel.addEventListener("bufferedamountlow", () => {
    // Resume sending. The sendNextChunk function checks offset and exits if done.
    sendNextChunk();
  });

  // Kick off the first send.
  sendNextChunk();
};

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Send a file</h1>

      {!conn && (
        <>
          <div className="flex flex-col items-center gap-2">
            <label className="text-gray-500">Enter the 6-digit code:</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              placeholder="123456"
              className="px-4 py-3 text-3xl font-mono text-center border-2 border-gray-300 rounded-lg w-56 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            onClick={handleConnect}
            disabled={code.length !== 6}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Connect
          </button>
        </>
      )}

      {conn && (
        <>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-gray-700"
          />

          <button
            onClick={handleSend}
            disabled={!file || sending}
            className="px-8 py-3 bg-green-600 text-white rounded-lg text-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {sending ? "Sending…" : "Send File"}
          </button>
        </>
      )}

      <p className="text-gray-600">{status}</p>
      {error && <p className="text-red-600 text-sm">Error: {error}</p>}
    </main>
  );
}