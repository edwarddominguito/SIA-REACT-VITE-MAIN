import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getCurrentUser, safeArray, subscribeKeys } from "@/services/storageService.js";
import {
  applyPropertyImageFallback,
  listingTypeLabel,
  normalizePropertyStatus,
  propertyPriceLabel,
  propertyStatusLabel,
  withImage
} from "@/utils/domain.js";
import "./public.css";

function useInView(ref, threshold = 0.12) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return visible;
}

function propertySpecs(property) {
  const items = [];
  if (Number(property?.bedrooms) > 0) items.push(`${property.bedrooms} Bed${Number(property.bedrooms) > 1 ? "s" : ""}`);
  if (Number(property?.bathrooms) > 0) items.push(`${property.bathrooms} Bath${Number(property.bathrooms) > 1 ? "s" : ""}`);
  if (Number(property?.areaSqft) > 0) items.push(`${Number(property.areaSqft).toLocaleString()} sqft`);
  return items;
}

function districtFromLocation(location) {
  const raw = String(location || "").trim();
  return raw ? (raw.split(",")[0]?.trim() || raw) : "Davao";
}

function agentHandle(agentLike) {
  const raw = String(agentLike || "").trim();
  if (!raw) return "@agent";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function navTargetForUser(user) {
  if (!user) {
    return { primaryTo: "/register", primaryLabel: "Get Started", heroLabel: "Start Booking", secondaryTo: "/login", secondaryLabel: "Sign in" };
  }
  if (user.role === "customer") {
    return { primaryTo: "/customer/book-appointment", primaryLabel: "Dashboard", heroLabel: "Start Booking", secondaryTo: "/dashboard", secondaryLabel: "Sign in" };
  }
  return { primaryTo: "/dashboard", primaryLabel: "Dashboard", heroLabel: "Open Dashboard", secondaryTo: "/dashboard", secondaryLabel: "Sign in" };
}

const wrap = { width: "min(1120px, calc(100% - 56px))", margin: "0 auto" };
const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, padding: "0 20px", borderRadius: 14, fontSize: ".98rem", fontWeight: 800, lineHeight: 1, textDecoration: "none", cursor: "pointer", transition: "all .18s ease" };
const btnDark = { ...btn, background: "#111318", color: "#fff", boxShadow: "0 10px 22px rgba(17,19,24,.14)" };
const btnPrimary = { ...btn, background: "linear-gradient(135deg,#1f2e59 0%,#3158d3 100%)", color: "#fff", boxShadow: "0 14px 28px rgba(49,88,211,.20)" };
const btnOutline = { ...btn, background: "rgba(255,255,255,.88)", color: "#374151", border: "1px solid rgba(148,163,184,.28)" };
const btnSm = { minHeight: 40, padding: "0 18px", borderRadius: 12, fontSize: ".95rem" };

function LandingStyleTag() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
      @keyframes tesHomeFadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      @keyframes tesHomePulse{0%,100%{opacity:1}50%{opacity:.35}}
      .tes-landing *,.tes-landing *::before,.tes-landing *::after{box-sizing:border-box}
      .tes-landing a{text-decoration:none;color:inherit}
      .tes-landing button{font:inherit}
      html{scroll-behavior:smooth}
      @media (max-width:1200px){
        .tes-home-hero-grid{grid-template-columns:1fr!important;gap:30px!important}
        .tes-home-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .tes-home-nav-links{gap:22px!important}
      }
      @media (max-width:768px){
        .tes-home-nav-shell,.tes-home-nav-right,.tes-home-nav-links,.tes-home-nav-actions,.tes-home-hero-actions,.tes-home-stats,.tes-home-footer,.tes-home-footer-links,.tes-home-cta-actions{flex-wrap:wrap!important}
        .tes-home-nav-right,.tes-home-nav-links,.tes-home-nav-actions{width:100%!important}
        .tes-home-nav-actions{padding-left:0!important;border-left:none!important}
        .tes-home-nav-actions a{flex:1 1 0}
        .tes-home-hero-grid,.tes-home-side-grid,.tes-home-grid,.tes-home-process-grid{grid-template-columns:1fr!important}
        .tes-home-hero-grid{gap:24px!important}
        .tes-home-list-head,.tes-home-footer{align-items:flex-start!important;flex-direction:column!important}
        .tes-home-hero-actions a{width:100%}
      }
    `}</style>
  );
}

function Topbar({ navTarget }) {
  return (
    <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "10px 0", background: "rgba(255,255,255,.9)", backdropFilter: "blur(18px) saturate(1.45)", borderBottom: "1px solid rgba(148,163,184,.18)", boxShadow: "0 8px 22px rgba(15,23,42,.05)" }}>
      <div className="tes-home-nav-shell" style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: "#111318", color: "#fff", display: "grid", placeItems: "center", boxShadow: "0 10px 20px rgba(17,19,24,.12)" }}><i className="bi bi-house-door"></i></span>
          <span><strong style={{ display: "block", fontSize: "1.05rem", lineHeight: 1, fontWeight: 900, letterSpacing: "-.03em" }}>TES PROPERTY</strong><span style={{ display: "block", marginTop: 3, fontSize: ".64rem", lineHeight: 1, fontWeight: 700, letterSpacing: ".32em", textTransform: "uppercase", color: "#94a3b8" }}>REAL ESTATE</span></span>
        </Link>
        <div className="tes-home-nav-right" style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <nav className="tes-home-nav-links" style={{ display: "flex", alignItems: "center", gap: 30 }}>
            <a href="#listings" style={{ color: "#6b7280", fontSize: "1rem", fontWeight: 700 }}>Listings</a>
            <a href="#how" style={{ color: "#6b7280", fontSize: "1rem", fontWeight: 700 }}>How it Works</a>
            <a href="#site-cta" style={{ color: "#6b7280", fontSize: "1rem", fontWeight: 700 }}>Agents</a>
          </nav>
          <div className="tes-home-nav-actions" style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 22, borderLeft: "1px solid rgba(148,163,184,.22)" }}>
            <Link to={navTarget.secondaryTo} style={{ ...btnOutline, ...btnSm }}>{navTarget.secondaryLabel}</Link>
            <Link to={navTarget.primaryTo} style={{ ...btnDark, ...btnSm }}>{navTarget.primaryLabel}</Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero({ property, stats, navTarget, onImageError }) {
  const specs = propertySpecs(property).slice(0, 3);
  return (
    <section style={{ position: "relative", overflow: "hidden", padding: "56px 0 28px" }}>
      <div style={{ position: "absolute", top: -160, right: -120, width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(69,104,242,.08), transparent 66%)" }} />
      <div style={{ position: "absolute", bottom: -100, left: -80, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,197,94,.05), transparent 68%)" }} />
      <div className="tes-home-hero-grid" style={{ ...wrap, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(430px, .95fr)", gap: 58, alignItems: "start" }}>
        <div style={{ animation: "tesHomeFadeUp .55s ease both" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px 8px 10px", borderRadius: 999, border: "1px solid rgba(148,163,184,.24)", background: "rgba(238,243,255,.92)", color: "#4568f2", fontSize: ".9rem", fontWeight: 800 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "tesHomePulse 2s infinite" }} />
            Davao Booking Platform
          </span>
          <h1 style={{ margin: "24px 0 0", fontSize: "5.1rem", lineHeight: ".96", letterSpacing: "-.075em", fontWeight: 900, color: "#182233" }}>
            Find the right<br />home, then book<br />the visit without<br />the <span style={{ color: "#4568f2", position: "relative", display: "inline-block" }}>guesswork<span style={{ position: "absolute", left: 0, right: 0, bottom: 6, borderBottom: "3px solid rgba(69,104,242,.34)", borderRadius: 999 }} /></span>.
          </h1>
          <p style={{ maxWidth: 520, margin: "22px 0 0", fontSize: "1.1rem", lineHeight: 1.75, color: "#667085", fontWeight: 500 }}>
            TES PROPERTY gives buyers and renters one clean place to compare verified listings, check viewing availability, and move faster with trusted local agents.
          </p>
          <div className="tes-home-hero-actions" style={{ display: "flex", alignItems: "stretch", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
            <Link to={navTarget.primaryTo} style={btnDark}>{navTarget.heroLabel}<span aria-hidden="true">→</span></Link>
            <a href="#listings" style={btnOutline}>Browse Featured Homes</a>
          </div>
          <div className="tes-home-stats" style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 34, flexWrap: "wrap" }}>
            {stats.map((stat) => <div key={stat.label} style={{ display: "flex", alignItems: "baseline", gap: 10 }}><strong style={{ fontSize: "2rem", fontWeight: 900, lineHeight: 1, letterSpacing: "-.05em", color: "#111827" }}>{stat.value}</strong><span style={{ color: "#98a2b3", fontSize: ".95rem", fontWeight: 700 }}>{stat.label}</span></div>)}
          </div>
        </div>
        <div style={{ animation: "tesHomeFadeUp .55s .08s ease both" }}>
          {property ? <>
            <article style={{ overflow: "hidden", borderRadius: 28, background: "#fff", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 18px 36px rgba(15,23,42,.10)" }}>
              <div style={{ position: "relative", height: 340, overflow: "hidden" }}>
                <img src={withImage(property)} alt={property.title || "Featured property"} onError={(event) => onImageError(event, property)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,.54) 100%)" }} />
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 1, padding: "26px 24px 24px" }}>
                  <span style={{ display: "inline-flex", marginBottom: 12, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,.16)", color: "#fff", fontSize: ".78rem", fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase" }}>Featured Right Now</span>
                  <h3 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.08, letterSpacing: "-.03em", color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.25)" }}>{property.title || "Property Listing"}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: "1rem", color: "rgba(255,255,255,.82)", fontWeight: 500 }}><i className="bi bi-geo-alt"></i>{property.location || "-"}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 24px 14px" }}>
                <strong style={{ fontSize: "1.6rem", lineHeight: 1, fontWeight: 900, letterSpacing: "-.04em", color: "#111827" }}>{propertyPriceLabel(property)}</strong>
                <Link to={`/properties/${property.id}`} state={{ from: "/" }} style={btnPrimary}>View Property →</Link>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 24px 22px" }}>{specs.map((item) => <span key={item} style={{ display: "inline-flex", alignItems: "center", minHeight: 30, padding: "0 12px", borderRadius: 10, background: "#f3f4f6", color: "#6b7280", fontSize: ".84rem", fontWeight: 700 }}>{item}</span>)}</div>
            </article>
            <div className="tes-home-side-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
              <div style={{ padding: "18px 20px", borderRadius: 18, background: "rgba(255,255,255,.82)", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 14px 28px rgba(15,23,42,.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: ".85rem", fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#3158d3" }}><i className="bi bi-clock-history"></i>Operating Hours</div>
                <div style={{ display: "grid", gap: 7, color: "#1f2937", fontSize: "1rem", lineHeight: 1.45, fontWeight: 700 }}><span>Mon-Fri: 8 AM - 5 PM</span><span>Saturday: 8 AM - 1 PM</span><span style={{ color: "#94a3b8" }}>Sunday: Closed</span></div>
              </div>
              <div style={{ padding: "18px 20px", borderRadius: 18, background: "rgba(255,255,255,.82)", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 14px 28px rgba(15,23,42,.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: ".85rem", fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#15803d" }}><i className="bi bi-check-circle"></i>Booking Status</div>
                <div style={{ display: "grid", gap: 8 }}><span style={{ display: "flex", alignItems: "center", gap: 6, color: "#1f2937", fontSize: "1rem", fontWeight: 700 }}><i className="bi bi-dot" style={{ color: "#16a34a" }}></i>{propertyStatusLabel(property)}</span><span style={{ display: "flex", alignItems: "center", gap: 6, color: "#1f2937", fontSize: "1rem", fontWeight: 700 }}><i className="bi bi-dot" style={{ color: "#ea580c" }}></i>Mon-Sat only</span><small style={{ marginTop: 2, color: "#98a2b3", fontSize: ".92rem", fontWeight: 700 }}>Book 24hrs in advance</small></div>
              </div>
            </div>
          </> : null}
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  const ref = useRef(null);
  const visible = useInView(ref);
  const items = [["bi-shield-check", "Verified Listings"], ["bi-lightning-charge", "Fast Viewing Requests"], ["bi-people", "Trusted Agent Network"], ["bi-lock", "Secure Transactions"]];
  return (
    <section ref={ref} style={{ padding: "20px 28px", background: "#171923" }}>
      <div className="tes-home-trust-grid" style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", gap: 34, flexWrap: "wrap" }}>
        {items.map(([icon, label], index) => <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,.44)", fontSize: ".92rem", fontWeight: 600, opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(8px)", transition: `all .35s ${index * 0.08}s ease` }}><i className={`bi ${icon}`}></i><span>{label}</span></div>)}
      </div>
    </section>
  );
}

function PropertyCard({ property, index, visible, onImageError }) {
  const [hovered, setHovered] = useState(false);
  const specs = propertySpecs(property).slice(0, 3);
  const available = normalizePropertyStatus(property?.propertyStatus || property?.status) === "available";
  return (
    <article onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ overflow: "hidden", borderRadius: 22, background: "#fff", border: "1px solid rgba(148,163,184,.20)", boxShadow: hovered ? "0 18px 34px rgba(15,23,42,.11)" : "0 14px 30px rgba(15,23,42,.07)", opacity: visible ? 1 : 0, transform: visible ? (hovered ? "translateY(-3px)" : "translateY(0)") : "translateY(14px)", transition: `opacity .4s ${index * 0.07}s ease, transform .4s ${index * 0.07}s ease, box-shadow .22s ease` }}>
      <div style={{ position: "relative", height: 220, overflow: "hidden", background: "linear-gradient(180deg,#eef2f7 0%,#dde5f1 100%)" }}>
        <img src={withImage(property)} alt={property.title || "Property"} onError={(event) => onImageError(event, property)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: hovered ? "scale(1.04)" : "scale(1)", transition: "transform .45s ease" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 50%, rgba(0,0,0,.30) 100%)" }} />
        <span style={{ position: "absolute", top: 14, left: 14, zIndex: 1, display: "inline-flex", alignItems: "center", minHeight: 30, padding: "0 12px", borderRadius: 999, background: available ? "#2b8a3e" : "#475569", color: "#fff", fontSize: ".76rem", fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase" }}>{propertyStatusLabel(property)}</span>
        {!!specs.length && <div style={{ position: "absolute", left: 14, right: 14, bottom: 12, zIndex: 1, display: "flex", flexWrap: "wrap", gap: 6 }}>{specs.map((item) => <span key={item} style={{ display: "inline-flex", alignItems: "center", minHeight: 24, padding: "0 8px", borderRadius: 8, background: "rgba(255,255,255,.92)", color: "#4b5563", fontSize: ".78rem", fontWeight: 800 }}>{item}</span>)}</div>}
      </div>
      <div style={{ padding: "18px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.24rem", lineHeight: 1.2, fontWeight: 900, color: "#171923", letterSpacing: "-.03em" }}>{property.title || "Property Listing"}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "#98a2b3", fontSize: ".95rem", fontWeight: 500 }}><i className="bi bi-geo-alt"></i>{property.location || "-"}</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", minHeight: 28, padding: "0 10px", borderRadius: 10, background: "#eef3ff", color: "#4568f2", fontSize: ".78rem", fontWeight: 800, whiteSpace: "nowrap" }}>{districtFromLocation(property.location)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "#98a2b3", fontSize: ".94rem", fontWeight: 500 }}><i className="bi bi-person"></i>Agent: {agentHandle(property.agent)}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", minHeight: 28, padding: "0 10px", borderRadius: 10, border: "1px solid rgba(148,163,184,.18)", background: "#f8fafc", color: "#475569", fontSize: ".78rem", fontWeight: 700 }}>{listingTypeLabel(property)}</span>
          {property.propertyType ? <span style={{ display: "inline-flex", alignItems: "center", minHeight: 28, padding: "0 10px", borderRadius: 10, border: "1px solid rgba(148,163,184,.18)", background: "#f8fafc", color: "#475569", fontSize: ".78rem", fontWeight: 700 }}>{String(property.propertyType).replace(/_/g, " ")}</span> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, paddingTop: 14, borderTop: "1px solid #eef2f7" }}>
          <div><small style={{ color: "#98a2b3", fontSize: ".8rem", fontWeight: 700, textTransform: "uppercase" }}>Price</small><div><strong style={{ fontSize: "1.8rem", lineHeight: 1, fontWeight: 900, letterSpacing: "-.05em", color: "#171923" }}>{propertyPriceLabel(property)}</strong></div></div>
          <Link to={`/properties/${property.id}`} state={{ from: "/" }} style={{ ...btnDark, ...btnSm }}>View →</Link>
        </div>
      </div>
    </article>
  );
}

function Listings({ properties, totalCount, availableCount, onImageError }) {
  const ref = useRef(null);
  const visible = useInView(ref);
  const [page, setPage] = useState(1);
  const perPage = 6;
  const totalPages = Math.max(1, Math.ceil(properties.length / perPage));
  const shown = useMemo(() => properties.slice((page - 1) * perPage, page * perPage), [properties, page]);
  useEffect(() => setPage((value) => Math.min(value, totalPages)), [totalPages]);
  return (
    <section id="listings" style={{ padding: "58px 0 0", background: "#fff" }} ref={ref}>
      <div className="tes-home-list-head" style={{ ...wrap, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: 30 }}>
        <div>
          <span style={{ display: "inline-flex", marginBottom: 8, color: "#4568f2", fontSize: ".84rem", fontWeight: 800, letterSpacing: ".22em", textTransform: "uppercase" }}>Featured Collection</span>
          <h2 style={{ margin: 0, fontSize: "3rem", lineHeight: 1.04, letterSpacing: "-.05em", fontWeight: 900, color: "#171923" }}>Properties worth viewing next</h2>
          <p style={{ margin: "10px 0 0", color: "#98a2b3", fontSize: "1.02rem", fontWeight: 600 }}>Handpicked homes and high-demand units available now.</p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <article style={{ minWidth: 100, padding: "16px 18px", borderRadius: 16, border: "1px solid rgba(148,163,184,.22)", background: "#fff", textAlign: "center" }}><strong style={{ display: "block", fontSize: "1.9rem", lineHeight: 1, fontWeight: 900, letterSpacing: "-.05em" }}>{totalCount}</strong><span style={{ display: "block", marginTop: 8, color: "#98a2b3", fontSize: ".82rem", fontWeight: 700 }}>Listings live</span></article>
          <article style={{ minWidth: 100, padding: "16px 18px", borderRadius: 16, border: "1px solid rgba(148,163,184,.22)", background: "#fff", textAlign: "center" }}><strong style={{ display: "block", fontSize: "1.9rem", lineHeight: 1, fontWeight: 900, letterSpacing: "-.05em" }}>{availableCount}</strong><span style={{ display: "block", marginTop: 8, color: "#98a2b3", fontSize: ".82rem", fontWeight: 700 }}>Ready to view</span></article>
        </div>
      </div>
      <div className="tes-home-grid" style={{ ...wrap, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20 }}>
        {shown.map((property, index) => <PropertyCard key={property.id} property={property} index={index} visible={visible} onImageError={onImageError} />)}
        {!shown.length && <div style={{ padding: "40px 24px", borderRadius: 18, border: "1px dashed rgba(148,163,184,.28)", textAlign: "center", color: "#6b7280" }}><i className="bi bi-house"></i><p>No featured properties yet.</p></div>}
      </div>
      {totalPages > 1 && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 30 }}>
        <button type="button" style={{ ...btnOutline, ...btnSm, opacity: page <= 1 ? .4 : 1 }} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Prev</button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => <button key={value} type="button" style={page === value ? { ...btnDark, ...btnSm } : { ...btnOutline, ...btnSm }} onClick={() => setPage(value)} aria-current={page === value ? "page" : undefined}>{value}</button>)}
        <button type="button" style={{ ...btnOutline, ...btnSm, opacity: page >= totalPages ? .4 : 1 }} disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next →</button>
      </div>}
    </section>
  );
}
function HowItWorks() {
  const ref = useRef(null);
  const visible = useInView(ref);
  const steps = [
    { num: "01", icon: "bi-search", title: "Browse Listings", desc: "Explore verified properties with real photos, specs, and pricing. Filter by location and budget." },
    { num: "02", icon: "bi-calendar3", title: "Pick Your Schedule", desc: "Choose a date and time from real availability. See office hours and book 24hrs in advance." },
    { num: "03", icon: "bi-check-circle", title: "Confirm & Visit", desc: "Review details, confirm your booking, and receive a reference number with email confirmation." }
  ];
  return (
    <section id="how" style={{ padding: "92px 0 0", background: "#f7f8fb" }}>
      <div style={wrap} ref={ref}>
        <div style={{ textAlign: "center", marginBottom: 34 }}>
          <span style={{ display: "inline-flex", marginBottom: 8, color: "#4568f2", fontSize: ".84rem", fontWeight: 800, letterSpacing: ".22em", textTransform: "uppercase" }}>Simple Process</span>
          <h2 style={{ margin: 0, fontSize: "3.1rem", lineHeight: 1.04, letterSpacing: "-.05em", fontWeight: 900, color: "#171923" }}>How It Works</h2>
          <p style={{ margin: "12px 0 0", color: "#98a2b3", fontSize: "1.05rem", fontWeight: 600 }}>From search to viewing in three easy steps.</p>
        </div>
        <div className="tes-home-process-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20 }}>
          {steps.map((step, index) => <article key={step.num} style={{ position: "relative", padding: 28, borderRadius: 24, border: "1px solid rgba(148,163,184,.18)", background: "#fff", boxShadow: "0 10px 22px rgba(15,23,42,.05)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(14px)", transition: `all .45s ${index * 0.1}s ease` }}>
            <b style={{ position: "absolute", top: 14, right: 18, fontSize: "4.6rem", lineHeight: 1, color: "rgba(148,163,184,.12)" }}>{step.num}</b>
            <div style={{ width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", marginBottom: 18, background: "#edf2ff", color: "#4568f2", fontSize: "1.2rem" }}><i className={`bi ${step.icon}`}></i></div>
            <strong style={{ display: "block", fontSize: "1.24rem", fontWeight: 900, lineHeight: 1.2, color: "#1f2937" }}>{step.title}</strong>
            <p style={{ marginTop: 12, color: "#667085", fontSize: "1rem", lineHeight: 1.7 }}>{step.desc}</p>
          </article>)}
        </div>
      </div>
    </section>
  );
}

function CTA({ navTarget }) {
  return (
    <section id="site-cta" style={{ marginTop: 92, padding: "70px 0", background: "linear-gradient(135deg,#171923 0%,#202334 100%)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -80, right: -80, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(69,104,242,.16), transparent 68%)" }} />
      <div style={{ ...wrap, position: "relative", maxWidth: 760, textAlign: "center" }}>
        <h2 style={{ margin: 0, color: "#fff", fontSize: "3rem", lineHeight: 1.05, letterSpacing: "-.05em", fontWeight: 900 }}>Ready to find your next home?</h2>
        <p style={{ margin: "16px auto 0", maxWidth: 620, color: "rgba(255,255,255,.62)", fontSize: "1.04rem", lineHeight: 1.7, fontWeight: 500 }}>Book a free property viewing today and let our trusted agents guide you through every step.</p>
        <div className="tes-home-cta-actions" style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 30 }}>
          <Link to={navTarget.primaryTo} style={{ ...btn, minWidth: 180, background: "#fff", color: "#111827", boxShadow: "0 12px 24px rgba(0,0,0,.18)" }}>Start Booking</Link>
          <a href="#site-cta" style={{ ...btn, minWidth: 180, background: "transparent", color: "rgba(255,255,255,.78)", border: "1px solid rgba(255,255,255,.16)" }}>Contact an Agent</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ padding: "26px 0", background: "#171923", borderTop: "1px solid rgba(255,255,255,.06)" }}>
      <div className="tes-home-footer" style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: "#111318", color: "rgba(255,255,255,.86)", display: "grid", placeItems: "center", boxShadow: "0 10px 20px rgba(17,19,24,.12)" }}><i className="bi bi-house-door"></i></span>
          <span><strong style={{ display: "block", fontSize: "1.05rem", lineHeight: 1, fontWeight: 900, letterSpacing: "-.03em", color: "rgba(255,255,255,.42)" }}>TES PROPERTY</strong><span style={{ display: "block", marginTop: 3, fontSize: ".64rem", lineHeight: 1, fontWeight: 700, letterSpacing: ".32em", textTransform: "uppercase", color: "rgba(255,255,255,.18)" }}>REAL ESTATE</span></span>
        </div>
        <div className="tes-home-footer-links" style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <a href="#listings" style={{ color: "rgba(255,255,255,.32)", fontSize: ".92rem", fontWeight: 600 }}>Listings</a>
          <a href="#site-cta" style={{ color: "rgba(255,255,255,.32)", fontSize: ".92rem", fontWeight: 600 }}>Agents</a>
          <a href="#site-cta" style={{ color: "rgba(255,255,255,.32)", fontSize: ".92rem", fontWeight: 600 }}>Contact</a>
          <a href="#site-cta" style={{ color: "rgba(255,255,255,.32)", fontSize: ".92rem", fontWeight: 600 }}>Privacy</a>
        </div>
        <small style={{ color: "rgba(255,255,255,.28)", fontSize: ".92rem", fontWeight: 500 }}>(c) 2026 TES PROPERTY Real Estate. All rights reserved.</small>
      </div>
    </footer>
  );
}

export default function Home() {
  const [properties, setProperties] = useState(() => safeArray("allProperties"));
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  useEffect(() => {
    const refresh = () => {
      setProperties(safeArray("allProperties"));
      setCurrentUser(getCurrentUser());
    };
    refresh();
    return subscribeKeys(["allProperties", "currentUser"], refresh);
  }, []);
  const rankedProperties = useMemo(() => properties.slice().sort((left, right) => {
    const leftAvailable = normalizePropertyStatus(left?.propertyStatus || left?.status) === "available" ? 1 : 0;
    const rightAvailable = normalizePropertyStatus(right?.propertyStatus || right?.status) === "available" ? 1 : 0;
    if (leftAvailable !== rightAvailable) return rightAvailable - leftAvailable;
    return Number(right?.price || 0) - Number(left?.price || 0);
  }), [properties]);
  const spotlightProperty = rankedProperties[0] || null;
  const availableCount = rankedProperties.filter((item) => normalizePropertyStatus(item?.propertyStatus || item?.status) === "available").length;
  const navTarget = navTargetForUser(currentUser);
  const stats = [
    { value: `${rankedProperties.length}+`, label: "Active Listings" },
    { value: `${availableCount}+`, label: "Available Today" },
    { value: "24hr", label: "Avg Response" }
  ];
  const handleImageError = (event, property) => {
    applyPropertyImageFallback(event.currentTarget, property || {});
  };
  return (
    <div className="tes-landing" style={{ minHeight: "100vh", fontFamily: "'Outfit',system-ui,sans-serif", color: "#111827", background: "radial-gradient(920px 520px at 8% -4%, rgba(59,91,219,.12), transparent 62%), radial-gradient(800px 420px at 100% 12%, rgba(15,23,42,.08), transparent 62%), linear-gradient(180deg,#f7f9fd 0%,#eef2f7 320px,#f8fafc 100%)" }}>
      <LandingStyleTag />
      <Topbar navTarget={navTarget} />
      <div style={{ height: 72 }} aria-hidden="true" />
      <main>
        <Hero property={spotlightProperty} stats={stats} navTarget={navTarget} onImageError={handleImageError} />
        <TrustBar />
        <Listings properties={rankedProperties} totalCount={rankedProperties.length} availableCount={availableCount} onImageError={handleImageError} />
        <HowItWorks />
        <CTA navTarget={navTarget} />
      </main>
      <Footer />
    </div>
  );
}

