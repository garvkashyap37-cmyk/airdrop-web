"use client";

import { useEffect, useRef, useState } from "react";
import Peer, { DataConnection } from "peerjs";

type FileMeta = { name: string; size: number; mime: string; totalChunks: number };

type DeliveredFile = { name: string; url: string };

export default function ReceivePage() {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting…");
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<FileMeta[] | null>(null);
  const [delivered, setDelivered] = useState<DeliveredFile[]>([]);
  const [progress, setProgress] = useState<{ name: string; current: number; total: number; pct: number } | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  // Per-file batch state
  const batchMetaRef = useRef<FileMeta[]>([]);
  const currentFileIndexRef = useRef(0);
  const chunksRef = useRef<ArrayBuffer[]>([]);
  const receivedBytesRef = useRef(0);
  const acceptingRef = useRef(false);

  useEffect(() => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const peer = new Peer(code);
    peerRef.current = peer;

    peer.on("open", (id) => {
      setPeerId(id);
      setStatus("Waiting for sender to connect…");
    });

    peer.on("connection", (conn: DataConnection) => {
      connRef.current = conn;
      setStatus("Connected! Waiting for offer…");

      conn.on("data", (data: any) => {
        // Sender proposes a batch of files
        if (data?.type === "offer" && Array.isArray(data.files)) {
          batchMetaRef.current = data.files;
          currentFileIndexRef.current = 0;
          chunksRef.current = [];
          receivedBytesRef.current = 0;
          acceptingRef.current = false;
          setOffer(data.files);
          setStatus(`Incoming ${data.files.length} file(s)`);
        }

        // Chunks arriving after the user accepted
        else if (data?.type === "chunk" && acceptingRef.current) {
          const meta = batchMetaRef.current[data.fileIndex];
          if (!meta) return;

          // If the chunk belongs to the next file, reset the buffer
          if (data.fileIndex !== currentFileIndexRef.current) {
            currentFileIndexRef.current = data.fileIndex;
            chunksRef.current = [];
            receivedBytesRef.current = 0;
          }

          chunksRef.current[data.index] = data.data;
          receivedBytesRef.current += data.data.byteLength;

          const pct = Math.round((receivedBytesRef.current / meta.size) * 100);
          setProgress({ name: meta.name, current: data.fileIndex + 1, total: batchMetaRef.current.length, pct });
          setStatus(`Receiving file ${data.fileIndex + 1} of ${batchMetaRef.current.length}: ${meta.name} (${pct}%)`);

          // File complete?
          if (
            chunksRef.current.length >= meta.totalChunks &&
            receivedBytesRef.current >= meta.size
          ) {
            const blob = new Blob(chunksRef.current, { type: meta.mime });
            const url = URL.createObjectURL(blob);
            setDelivered((prev) => [...prev, { name: meta.name, url }]);

            // Reset for the next file in the batch
            chunksRef.current = [];
            receivedBytesRef.current = 0;

            // If this was the last file, wrap up
            if (data.fileIndex === batchMetaRef.current.length - 1) {
              acceptingRef.current = false;
              setOffer(null);
              setProgress(null);
              setStatus(`All ${batchMetaRef.current.length} file(s) received.`);
            }
          }
        }
      });

      conn.on("close", () => {
        connRef.current = null;
        setStatus("Sender disconnected.");
        setOffer(null);
        setProgress(null);
        acceptingRef.current = false;
      });

      conn.on("error", (err) => setError(err.message));
    });

    peer.on("error", (err) => {
      setError(err.message);
      setStatus("Error");
    });

    return () => { peer.destroy(); };
  }, []);

  const handleAccept = () => {
    if (!connRef.current || !offer) return;
    acceptingRef.current = true;
    connRef.current.send({ type: "accept" });
    setOffer(null);
    setStatus("Accepted — receiving files…");
  };

  const handleDecline = () => {
    if (!connRef.current) return;
    connRef.current.send({ type: "decline" });
    batchMetaRef.current = [];
    currentFileIndexRef.current = 0;
    chunksRef.current = [];
    receivedBytesRef.current = 0;
    acceptingRef.current = false;
    setOffer(null);
    setStatus("Declined. Waiting for next offer…");
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Receive</h1>

      <div className="flex flex-col items-center gap-2">
        <p className="text-gray-500">Your code:</p>
        <div className="text-6xl font-mono font-bold tracking-widest">
          {peerId ?? "------"}
        </div>
      </div>

      <p className="text-gray-600 text-sm text-center max-w-md">{status}</p>

      {offer && (
        <div className="border-2 border-blue-400 rounded-xl p-4 flex flex-col gap-3 bg-blue-50 max-w-md w-full">
          <p className="font-medium text-center">Incoming {offer.length} file(s):</p>
          <ul className="text-sm max-h-40 overflow-y-auto border rounded p-2 bg-white">
            {offer.map((f, i) => (
              <li key={i}>• {f.name} ({(f.size / 1024).toFixed(1)} KB)</li>
            ))}
          </ul>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleAccept}
              className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Accept All
            </button>
            <button
              onClick={handleDecline}
              className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {progress && (
        <div className="w-full max-w-md">
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

      {delivered.length > 0 && (
        <div className="flex flex-col gap-2 w-full max-w-md">
          <p className="text-gray-500 text-sm">Received files — click to download:</p>
          {delivered.map((item, i) => (
            <a
              key={i}
              href={item.url}
              download={item.name}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-center hover:bg-green-700"
            >
              Download {item.name}
            </a>
          ))}
        </div>
      )}

      {error && <p className="text-red-600 text-sm">Error: {error}</p>}
    </main>
  );
}