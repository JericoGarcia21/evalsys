import { Link } from 'react-router-dom';
import '../pages/Legal.css';

export function CopyrightNotice() {
  return <p className="evl-copyright">© {new Date().getFullYear()} Jerico B. Garcia. All rights reserved.</p>;
}

export default function LegalLinks({ newTab = false }: { newTab?: boolean }) {
  return <nav className="evl-legal-links" aria-label="Legal information">
    <Link to="/terms" target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined}>Terms of Use{newTab && <span className="sr-only"> (opens in a new tab)</span>}</Link>
    <Link to="/privacy" target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined}>Privacy Policy{newTab && <span className="sr-only"> (opens in a new tab)</span>}</Link>
    <Link to="/copyright" target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined}>Copyright / Takedown{newTab && <span className="sr-only"> (opens in a new tab)</span>}</Link>
  </nav>;
}
