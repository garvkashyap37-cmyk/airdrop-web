import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-4xl font-bold">AirDrop Web</h1>
      <p className="text-gray-500">Send files from one device to another. No accounts. No uploads.</p>

      <div className="flex gap-4">
        <Link
          href="/send"
          className="px-8 py-4 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700"
        >
          Send
        </Link>
        <Link
          href="/receive"
          className="px-8 py-4 bg-green-600 text-white rounded-lg text-lg font-medium hover:bg-green-700"
        >
          Receive
        </Link>
      </div>
    </main>
  );
}