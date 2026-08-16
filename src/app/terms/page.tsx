import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Down to Split",
};

export default function TermsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-display-lg font-display font-bold text-foreground">
          Terms of Service
        </h1>
        <p className="mt-1 text-label font-body text-foreground/60">
          Last updated August 2026
        </p>
      </div>

      <p className="text-body font-body text-foreground/80">
        Down to Split is a listing tool that helps Notre Dame students find
        each other to split airport rides. By using it, you agree to the
        terms below. This is a small, student-run project — not a
        commercial transportation service, and not affiliated with or
        endorsed by the University of Notre Dame.
      </p>

      <Section title="Eligibility">
        <p>
          You need a valid @nd.edu Google account to sign up. Accounts
          outside that domain aren&apos;t permitted.
        </p>
      </Section>

      <Section title="What the service is">
        <p>
          Down to Split lets you post or join a shared airport ride and
          exchange contact info with the people you&apos;re matched with.
          That&apos;s it — we don&apos;t provide transportation ourselves,
          don&apos;t vet drivers, vehicles, or other users, and
          don&apos;t process any payments. Any ride arrangement and cost
          split happens directly between the riders involved, off-platform.
        </p>
      </Section>

      <Section title="Your responsibilities">
        <ul className="list-disc space-y-2 pl-5">
          <li>Post accurate trip information.</li>
          <li>
            Use your own judgment about who you choose to ride with, and
            treat other riders respectfully.
          </li>
          <li>
            Settle costs, pickup logistics, and any disputes directly with
            the other riders in your group.
          </li>
        </ul>
      </Section>

      <Section title="No warranty, no liability">
        <p>
          The service is provided as-is, with no guarantee that a ride
          match will be available, reliable, or safe. We&apos;re not
          responsible for cancellations, no-shows, payment disputes,
          vehicle issues, or anything else that happens between riders
          once you&apos;re coordinating off-platform. Use it at your own
          risk and use good judgment.
        </p>
      </Section>

      <Section title="Account access">
        <p>
          We may suspend or remove access for abuse, harassment, or
          misuse of the service.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If these terms change in a meaningful way, we&apos;ll update
          this page and adjust the date above.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions? Reach out at{" "}
          <a
            href="mailto:rolin71110@gmail.com"
            className="text-primary underline underline-offset-2"
          >
            rolin71110@gmail.com
          </a>
          .
        </p>
      </Section>

      <Link
        href="/login"
        className="text-label font-display font-semibold text-primary underline underline-offset-2"
      >
        Back to sign in
      </Link>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-route font-display font-semibold text-foreground">
        {title}
      </h2>
      <div className="text-body font-body text-foreground/80">
        {children}
      </div>
    </section>
  );
}
