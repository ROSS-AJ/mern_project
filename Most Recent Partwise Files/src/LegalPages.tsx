import type { ReactNode } from 'react'
import { href, navigate } from './router'
import logoUrl from './assets/partwise-logo.png'

/**
 * The Terms of Service (/terms) and Privacy Policy (/privacy). Both describe
 * what the site actually does (server.js, models/), so update them when that
 * changes: new data stored, a new outside service, self-service account
 * deletion, and so on. Bump UPDATED whenever the wording changes.
 */
export const CONTACT_EMAIL = 'panipalisaac@gmail.com'
const UPDATED = '27 November 2026'

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>

/** A link to another site page that stays in the app (no full reload). */
export function PageLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={href(to)}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

function LegalPage({ title, other, children }: { title: string; other: { to: string; label: string }; children: ReactNode }) {
  return (
    <div className="auth-page legal-page">
      <section className="legal-side">
        <header className="legal-top">
          <PageLink to="/">
            <span className="auth-brand">
              <img className="brand-mark" src={logoUrl} alt="" />
              <span>Partwise</span>
            </span>
          </PageLink>
          <nav aria-label="Legal">
            <PageLink to={other.to}>{other.label}</PageLink>
          </nav>
        </header>

        <article className="legal-card">
          <h1>{title}</h1>
          <p className="legal-updated">Last updated {UPDATED}</p>
          {children}
        </article>

        <p className="legal-footer">
          © 2026 Partwise · <PageLink to="/">Home</PageLink>
        </p>
      </section>
    </div>
  )
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of Service" other={{ to: '/privacy', label: 'Privacy Policy' }}>
      <p className="legal-lead">
        Partwise is a student class project. These terms explain what you can expect from it and what we
        ask of you. By creating an account, you agree to them.
      </p>

      <h2>What Partwise is</h2>
      <p>
        Partwise turns a full score PDF into separate parts for each player. You can use the editor without
        an account; your work then stays in your browser. With an account, you can also save scores to the
        site and open them again from your dashboard.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 13 years old to create an account.</li>
        <li>Use your own details, and keep your password to yourself. You are responsible for what is done with your account.</li>
        <li>If you think someone else has used your account, reset your password and let us know.</li>
      </ul>

      <h2>Your scores stay yours</h2>
      <ul>
        <li>You keep every right you have in the scores you upload. We don’t claim ownership of them.</li>
        <li>
          By uploading a score, you let us store it and process it only so Partwise can work for you: showing it,
          splitting it into parts and saving your layout.
        </li>
        <li>
          Only upload music you have the right to use, such as public domain scores, music you wrote, or scores you
          or your ensemble have bought. Don’t upload pirated scores.
        </li>
      </ul>

      <h2>Using Partwise fairly</h2>
      <p>Please don’t:</p>
      <ul>
        <li>upload anything illegal or harmful, or files that aren’t sheet music;</li>
        <li>try to get into other people’s accounts or data, or get around the site’s limits;</li>
        <li>overload the site, for example with automated requests.</li>
      </ul>
      <p>
        Each score can be up to 25 MB. Site admins may remove scores or accounts that break these terms. Deleting
        an account also deletes its scores.
      </p>

      <h2>No guarantees</h2>
      <p>
        Because Partwise is a class project, it may change, go offline or shut down at any time, possibly without
        notice. It is provided “as is”, without any warranty, and we can’t be held responsible for lost work or
        other damage from using it. Keep your own copies: the dashboard can download any saved score as a
        .partwise file.
      </p>

      <h2>Sheet music on the sign-in pages</h2>
      <p>
        The faint scores behind the sign-in pages come from the Mutopia Project. Some are shared under Creative
        Commons licences; they are listed under “Score credits” on the sign-in page.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. The date at the top shows when they last changed. If you keep using Partwise
        after a change, the new terms apply.
      </p>

      <h2>Contact</h2>
      <p>Questions about these terms: <Mail />.</p>
    </LegalPage>
  )
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" other={{ to: '/terms', label: 'Terms of Service' }}>
      <p className="legal-lead">
        Partwise is a student class project. We keep only what the site needs to work, and we don’t track you,
        show ads or sell anything about you.
      </p>

      <h2>What we store</h2>
      <h3>Your account</h3>
      <ul>
        <li>Your first and last name, username and email address.</li>
        <li>
          Your password, stored only as a secure hash. Nobody can read it back, including us. If you forget it, you
          choose a new one.
        </li>
        <li>Whether you have confirmed your email address, and whether your account is a regular or admin account.</li>
      </ul>
      <h3>Your scores</h3>
      <ul>
        <li>The PDFs you upload, kept as files on our server, with their original file name and size.</li>
        <li>What you set up in the editor: the score’s title, page count, part names and which pages belong to each part.</li>
      </ul>
      <h3>Server logs</h3>
      <p>
        Like most websites, our web server keeps standard access logs (IP address, the page requested and the time)
        for security and troubleshooting. They are deleted automatically on a regular schedule.
      </p>

      <h2>What we don’t do</h2>
      <ul>
        <li>No analytics, advertising or tracking cookies.</li>
        <li>We don’t sell, rent or share your information with anyone for marketing.</li>
        <li>We don’t look through your scores. They are opened only to run the site, or if you ask us for help.</li>
      </ul>

      <h2>What your browser keeps</h2>
      <p>Partwise doesn’t use cookies. It does use your browser’s own storage:</p>
      <ul>
        <li>Your sign-in is saved in local storage. It lasts an hour and is renewed while you work. Signing out removes it.</li>
        <li>The editor keeps the score you are working on in your browser (IndexedDB), so a reload doesn’t lose it.</li>
        <li>If you use the editor without an account, your score never leaves your device.</li>
      </ul>

      <h2>Emails</h2>
      <p>
        We only email you to confirm your address and to reset your password. Reset links stop working after an hour.
      </p>

      <h2>Who can see your information</h2>
      <ul>
        <li>You, when signed in.</li>
        <li>
          Partwise’s site admins, the students running the project. They can see account details, score names and
          how much storage each account uses, and can delete accounts.
        </li>
        <li>
          The services that run the site: DigitalOcean, which hosts our server; the email service that sends our
          emails; and Google Fonts, which supplies the site’s fonts and so sees your IP address when a page loads.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Your scores are kept until you delete them, and your account until it is deleted. Deleting a score from your
        dashboard removes its PDF from our server. Deleting an account removes all of its scores and files.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Download any saved score as a .partwise file from your dashboard, or delete it there.</li>
        <li>To delete your account, or to get a copy of what we hold about you, email <Mail /> from the address on your account.</li>
      </ul>

      <h2>Keeping it safe</h2>
      <p>
        The site is served over HTTPS and passwords are stored only as hashes. No system is perfectly secure, so
        please use a password you don’t use anywhere else.
      </p>

      <h2>Children</h2>
      <p>
        Partwise isn’t meant for children under 13, and we don’t knowingly keep their information. If you think a
        child has made an account, email us and we will delete it.
      </p>

      <h2>Changes</h2>
      <p>We may update this policy. The date at the top shows when it last changed.</p>

      <h2>Contact</h2>
      <p>Questions about your information: <Mail />.</p>
    </LegalPage>
  )
}
