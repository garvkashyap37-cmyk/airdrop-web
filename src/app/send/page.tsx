"use client";

import { useState, useRef } from "react";
import Peer, { DataConnection } from "peerjs";

const CHUNK_SIZE = 64 * 1024;
const SIZE_WARNING_THRESHOLD = 500 * 1024 * 1024; // 500 MB

type FileMeta = { name: string; size: number; mime: string; totalChunks: number };

export default function SendPage() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [error, setError] = useState<string | null>(null);
  const [conn, setConn] = useState<DataConnection | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; name: string; pct: number } | null>(null);

  const fileListRef = useRef<File[]>([]);
  const currentFileIndexRef = useRef(0);
  const awaitingAcceptRef = useRef(false);

  const handleConnect = () => {
    setError(null);
    setStatus("Connecting…");

    const peer = new Peer();

    peer.on("open", () => {
      const connection = peer.connect(code);

      connection.on("open", () => {
        setStatus(`Connected to ${code}`);
        setConn(connection);

        connection.on("data", (data: any) => {
          if (data?.type === "accept") {
            awaitingAcceptRef.current = false;
            sendNextFile(connection);
          } else if (data?.type === "decline") {
            awaitingAcceptRef.current = false;
            setStatus("Receiver declined the files.");
            setSending(false);
            setProgress(null);
          }
        });

        connection.on("close", () => {
          setConn(null);
          setSending(false);
          setProgress(null);
          setStatus("Receiver disconnected.");
        });
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

  const handleSendAll = () => {
    if (!conn || files.length === 0) return;

    fileListRef.current = files;
    currentFileIndexRef.current = 0;
    setSending(true);

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > SIZE_WARNING_THRESHOLD) {
      setStatus(`Warning: ${(totalSize / 1024 / 1024).toFixed(0)} MB total. Large transfers may fail on mobile.`);
      // Still proceed — user already picked and clicked send
    }

    // Build one offer containing every file's metadata
    const offerFiles: FileMeta[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      mime: f.type,
      totalChunks: Math.ceil(f.size / CHUNK_SIZE),
    }));

    conn.send({ type: "offer", files: offerFiles });
    setStatus(`Waiting for receiver to accept ${files.length} file(s)…`);
    awaitingAcceptRef.current = true;
  };

  const sendNextFile = (connection: DataConnection) => {
    const index = currentFileIndexRef.current;
    const allFiles = fileListRef.current;

    if (index >= allFiles.length) {
      setStatus("All files sent.");
      setSending(false);
      setProgress(null);
      setFiles([]);
      return;
    }

    const file = allFiles[index];
    const dataChannel = (connection as any).dataChannel as RTCDataChannel | undefined;
    if (!dataChannel) {
      setError("Cannot access data channel.");
      setSending(false);
      return;
    }
    dataChannel.bufferedAmountLowThreshold = 1024 * 1024;

    let offset = 0;
    let chunkIndex = 0;
    const reader = new FileReader();

    const sendNextChunk = () => {
      if (offset >= file.size) {
        // Finished this file — move to the next
        currentFileIndexRef.current++;
        sendNextFile(connection);
        return;
      }
      if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
        return;
      }
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      try {
        connection.send({ type: "chunk", fileIndex: index, index: chunkIndex, data: buffer });
      } catch {
        setError("Send failed — connection may have dropped.");
        setSending(false);
        return;
      }
      chunkIndex++;
      offset += CHUNK_SIZE;

      const pct = Math.round((offset / file.size) * 100);
      setProgress({ current: index + 1, total: allFiles.length, name: file.name, pct });
      setStatus(`Sending file ${index + 1} of ${allFiles.length}: ${file.name} (${pct}%)`);

      sendNextChunk();
    };

    reader.onerror = () => {
      setError("Failed to read file");
      setSending(false);
    };

    dataChannel.addEventListener("bufferedamountlow", () => sendNextChunk());
    sendNextChunk();
  };

  const totalSelectedSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Send</h1>

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
        <div className="flex flex-col items-center gap-4 w-full max-w-md">
          <label className="text-gray-500">Pick files (any number):</label>
          <input
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="text-gray-700"
          />

          {files.length > 0 && (
            <div className="w-full text-sm text-gray-600">
              <p className="mb-1">{files.length} file(s) — {(totalSelectedSize / 1024 / 1024).toFixed(1)} MB total</p>
              <ul className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
                {files.map((f, i) => (
                  <li key={i}>• {f.name} ({(f.size / 1024).toFixed(1)} KB)</li>
                ))}
              </ul>
              {totalSelectedSize > SIZE_WARNING_THRESHOLD && (
                <p className="text-amber-600 mt-1 text-xs">
                  Warning: total exceeds 500 MB. Large transfers may fail on mobile browsers.
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleSendAll}
            disabled={sending || files.length === 0}
            className="px-8 py-3 bg-green-600 text-white rounded-lg text-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {sending ? "Sending…" : `Send ${files.length || ""} File${files.length === 1 ? "" : "s"}`}
          </button>

          {progress && (
            <div className="w-full">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{progress.name}</span>
                <span>File {progress.current} / {progress.total}</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded">
                <div
                  className="h-2 bg-blue-600 rounded transition-all"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-gray-600 text-sm text-center max-w-md">{status}</p>
      {error && <p className="text-red-600 text-sm">Error: {error}</p>}
    </main>
  );
}