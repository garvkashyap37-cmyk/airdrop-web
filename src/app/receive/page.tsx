"use client";

import { useEffect, useRef, useState } from "react";
import Peer, { DataConnection } from "peerjs";

export default function ReceivePage() {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting…");
  const [error, setError] = useState<string | null>(null);
  const [receivedFile, setReceivedFile] = useState<{ name: string; url: string } | null>(null);
  const peerRef = useRef<Peer | null>(null);

  useEffect(() => {
    const code = String(Math.floor(100000 + Math.random() * 900000));

    const peer = new Peer(code);
    peerRef.current = peer;

    peer.on("open", (id) => {
      setPeerId(id);
      setStatus("Waiting for sender to connect…");
    });

    peer.on("connection", (conn: DataConnection) => {
      setStatus("Connected! Waiting for file…");

      let pendingMeta: {
        name: string;
        size: number;
        mime: string;
        totalChunks: number;
      } | null = null;
      let chunks: ArrayBuffer[] = [];
      let receivedBytes = 0;

      conn.on("data", (data: any) => {
        if (data?.type === "metadata") {
          pendingMeta = data;
          chunks = [];
          receivedBytes = 0;
          setStatus(`Receiving ${data.name}…`);
        } else if (data?.type === "chunk" && pendingMeta) {
          chunks[data.index] = data.data;
          receivedBytes += data.data.byteLength;

          const pct = Math.round((receivedBytes / pendingMeta.size) * 100);
          setStatus(`Receiving ${pendingMeta.name}… ${pct}%`);

          if (
            chunks.length >= pendingMeta.totalChunks &&
            receivedBytes >= pendingMeta.size
          ) {
            const meta = pendingMeta;
            pendingMeta = null;

            const blob = new Blob(chunks, { type: meta.mime });
            const url = URL.createObjectURL(blob);
            setReceivedFile({ name: meta.name, url });
            setStatus(`Received ${meta.name}`);

            const a = document.createElement("a");
            a.href = url;
            a.download = meta.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            chunks = [];
            receivedBytes = 0;
          }
        }
      });

      conn.on("error", (err) => {
        setError(err.message);
      });
    });

    peer.on("error", (err) => {
      setError(err.message);
      setStatus("Error");
    });

    return () => {
      peer.destroy();
    };
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Receive a file</h1>

      <div className="flex flex-col items-center gap-2">
        <p className="text-gray-500">Your code:</p>
        <div className="text-6xl font-mono font-bold tracking-widest">
          {peerId ?? "------"}
        </div>
      </div>

      <p className="text-gray-600">{status}</p>

      {receivedFile && (
        <a
          href={receivedFile.url}
          download={receivedFile.name}
          className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
        >
          Download {receivedFile.name}
        </a>
      )}

      {error && <p className="text-red-600 text-sm">Error: {error}</p>}
    </main>
  );
}