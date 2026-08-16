import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Down to Split",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-display-lg font-display font-bold text-foreground">
          Privacy Policy
        </h1>
        <p className="mt-1 text-label font-body text-foreground/60">
          Last updated August 2026
        </p>
      </div>

      <p className="text-body font-body text-foreground/80">
        Down to Split is a rideshare-matching tool built by and for Notre
        Dame students, to help find others heading to and from the airport
        at the same time. It is not affiliated with or endorsed by the
        University of Notre Dame.
      </p>

      <Section title="What we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Your @nd.edu email</strong>, via Google Sign-In. We
            require an @nd.edu Google account to sign up — this is how we
            verify you&apos;re a Notre Dame student.
          </li>
          <li>
            <strong>Trip details you post</strong>: pickup/dropoff
            locations, flight time, vehicle type, seat/bag capacity, and an
            estimated cost.
          </li>
          <li>
            <strong>Contact info you choose to share</strong> (a phone
            number, email, or group chat link) when posting or joining a
            trip, so matched riders can coordinate directly.
          </li>
          <li>
            <strong>Signup records</strong>: which trips you&apos;ve joined
            or left, and how many bags you&apos;re bringing.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        <p>
          To authenticate you and verify your Notre Dame affiliation, to
          show trip listings to other signed-in users, to let matched
          riders get in touch with each other, and to keep trip
          availability (seats/bags remaining) up to date in real time.
        </p>
      </Section>

      <Section title="Who can see what">
        <p>
          Any signed-in user can see posted trip listings — direction,
          times, locations, capacity, and estimated cost. Your contact
          info is different: it&apos;s only visible to people who&apos;ve
          actually joined the same trip group. That restriction is
          enforced at the database level, not just hidden in the app UI, so
          it isn&apos;t exposed to other signed-in users browsing the trip
          board.
        </p>
      </Section>

      <Section title="What we don't do">
        <ul className="list-disc space-y-2 pl-5">
          <li>We don&apos;t sell your data.</li>
          <li>We don&apos;t share it with third parties for advertising.</li>
          <li>
            We don&apos;t process payments. Any cost-splitting happens
            directly between riders, off-platform — the estimated cost
            shown is just that, an estimate.
          </li>
        </ul>
      </Section>

      <Section title="Where it's stored">
        <p>
          Data is stored with Supabase, a cloud database provider. Sign-in
          is handled by Google.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Want your account and data removed? Email us at{" "}
          <a
            href="mailto:rolin71110@gmail.com"
            className="text-primary underline underline-offset-2"
          >
            rolin71110@gmail.com
          </a>{" "}
          and we&apos;ll take care of it.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes in a meaningful way, we&apos;ll update
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
