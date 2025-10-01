// src/app/page.tsx

export default function Home() {
  return (
    // We'll use a main tag for our primary page content.
    // The Tailwind classes add some padding for spacing.
    <main className="p-8">
      <h1 className="text-2xl font-bold">
        Welcome to the Intranet Portal
      </h1>
      <p className="mt-4">
        This is the main content area. We will build our components here.
      </p>
    </main>
  );
}