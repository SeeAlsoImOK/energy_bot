export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "3rem", maxWidth: 640 }}>
      <h1>Energy Infinitus LINE Bot</h1>
      <p>
        This service exposes a LINE Messaging API webhook at{" "}
        <code>/api/line-webhook</code>. Point your LINE Official Account&apos;s
        webhook URL to this endpoint.
      </p>
    </main>
  );
}
