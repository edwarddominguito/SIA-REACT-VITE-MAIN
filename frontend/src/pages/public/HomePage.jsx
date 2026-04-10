import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getCurrentUser, safeArray, subscribeKeys } from "@/services/storageService.js";
import {
  applyPropertyImageFallback,
  isDisplayableProperty,
  listingTypeLabel,
  normalizePropertyStatus,
  propertyPriceLabel,
  propertyStatusLabel,
  withImage
} from "@/utils/domain.js";
import {
  Button,
  Card,
  ListingCard,
  SearchBar,
  Section,
  SectionHeader,
  StatCard
} from "@/components/ui/index.js";

/* ─── helpers ─── */

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
  if (Number(property?.bedrooms) > 0) {
    items.push(`${property.bedrooms} Bed${Number(property.bedrooms) > 1 ? "s" : ""}`);
  }
  if (Number(property?.bathrooms) > 0) {
    items.push(`${property.bathrooms} Bath${Number(property.bathrooms) > 1 ? "s" : ""}`);
  }
  if (Number(property?.areaSqft) > 0) {
    items.push(`${Number(property.areaSqft).toLocaleString()} sqft`);
  }
  return items;
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

/* ─── Topbar ─── */

function Topbar({ navTarget }) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/80 backdrop-blur-xl" style={{ WebkitBackdropFilter: "blur(20px)" }}>
      <div className="container flex min-h-[68px] items-center justify-between gap-6 py-2">
        <Link to="/" className="inline-flex items-center gap-2.5 no-underline">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-white">
            <i className="bi bi-buildings" style={{ fontSize: "1rem" }}></i>
          </span>
          <span className="leading-tight">
            <strong className="block text-[0.88rem] font-bold tracking-tight text-zinc-900">TES PROPERTY</strong>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">Real Estate</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="hidden items-center gap-1 md:flex" aria-label="Landing navigation">
            {[["#listings", "Listings"], ["#how", "How it Works"], ["#site-cta", "Agents"]].map(([href, label]) => (
              <a key={href} href={href} className="rounded-lg px-3.5 py-2 text-[0.82rem] font-medium text-zinc-500 no-underline transition-colors hover:bg-zinc-50 hover:text-zinc-900">
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden h-5 w-px bg-zinc-200 md:block" />
          <Button as={Link} to={navTarget.secondaryTo} variant="ghost" className="hidden text-zinc-500 hover:text-zinc-900 sm:inline-flex">{navTarget.secondaryLabel}</Button>
          <Button as={Link} to={navTarget.primaryTo} className="h-9 rounded-lg px-5 text-[0.8rem]">{navTarget.primaryLabel}</Button>
        </div>
      </div>
    </header>
  );
}

/* ─── Hero ─── */

function Hero({ property, stats, navTarget, query, setQuery, onImageError }) {
  return (
    <Section className="pb-14 pt-12 md:pb-20 md:pt-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.88fr)_minmax(400px,1.12fr)] lg:items-center">
        <div className="space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-[0.72rem] font-semibold text-zinc-500">Davao Booking Platform</span>
          </div>

          <h1 style={{ fontSize: "clamp(2rem, 4.2vw, 3.2rem)", lineHeight: 1.08, letterSpacing: "-0.03em" }} className="max-w-[14ch] font-bold text-zinc-900">
            Find the right home, then book the visit without the <span className="text-zinc-400">guesswork.</span>
          </h1>

          <p className="max-w-[42ch] text-[0.92rem] leading-relaxed text-zinc-500">
            Compare verified listings, check viewing availability, and move faster with trusted local agents.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button as={Link} to={navTarget.primaryTo} size="cta" className="h-12 rounded-xl bg-zinc-900 px-7 text-[0.88rem] font-semibold hover:bg-black sm:w-auto">
              {navTarget.heroLabel}
              <i className="bi bi-arrow-right"></i>
            </Button>
            <Button as="a" href="#listings" variant="secondary" size="cta" className="h-12 rounded-xl px-7 text-[0.88rem] font-semibold sm:w-auto">
              Browse Homes
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-4">
                <span className="block text-[0.62rem] font-bold uppercase tracking-[0.12em] text-zinc-400">{stat.label}</span>
                <strong className="mt-1 block text-[1.5rem] font-bold tracking-tight text-zinc-900">{stat.value}</strong>
              </div>
            ))}
          </div>
        </div>

        {property ? (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg shadow-zinc-200/50">
            <div className="relative">
              <div className="aspect-[16/10] w-full overflow-hidden">
                <img
                  src={withImage(property)}
                  alt={property.title || "Featured property"}
                  className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                  onError={(event) => onImageError(event, property)}
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute left-4 top-4 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[0.7rem] font-bold text-zinc-800 shadow-sm backdrop-blur-sm">
                  <i className="bi bi-star-fill text-amber-500" style={{ fontSize: "0.6rem" }}></i>
                  Featured
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <h3 className="text-xl font-bold tracking-tight text-white drop-shadow-sm md:text-2xl">{property.title || "Property Listing"}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80">
                  <i className="bi bi-geo-alt" style={{ fontSize: "0.75rem" }}></i>
                  <span>{property.location || "-"}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {propertySpecs(property).map((item) => (
                    <span key={item} className="rounded-md border border-zinc-100 bg-zinc-50 px-2.5 py-1 text-[0.72rem] font-semibold text-zinc-600">{item}</span>
                  ))}
                </div>
                <strong className="mt-2 block text-[1.6rem] font-bold tracking-tight text-zinc-900 md:text-[1.8rem]">{propertyPriceLabel(property)}</strong>
              </div>
              <Button as={Link} to={`/properties/${property.id}`} state={{ from: "/" }} className="h-10 shrink-0 rounded-lg bg-zinc-900 px-5 text-[0.82rem] font-semibold hover:bg-black sm:w-auto">
                View Property
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-[0.92rem] leading-relaxed text-zinc-500">
              TES PROPERTY gives buyers and renters one clean place to compare verified listings, check viewing availability, and move faster with trusted local agents.
            </p>
            <SearchBar
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, location, type, or agent"
              className="h-auto flex-col items-stretch gap-3 rounded-2xl px-4 py-4 sm:h-14 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-0"
              inputClassName="w-full text-sm sm:text-base"
              action={
                <a href="#listings" className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-zinc-200 px-4 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-700 no-underline hover:bg-zinc-50 sm:h-9 sm:w-auto">Go</a>
              }
            />
          </div>
        )}
      </div>
    </Section>
  );
}

/* ─── Trust Bar ─── */

function TrustBar() {
  const ref = useRef(null);
  const visible = useInView(ref);
  const items = [
    ["bi-shield-check", "Verified Listings"],
    ["bi-lightning-charge", "Fast Viewing Requests"],
    ["bi-people", "Trusted Agent Network"],
    ["bi-lock", "Secure Transactions"]
  ];

  return (
    <section ref={ref} className="border-y border-zinc-200 bg-zinc-50/80 py-5">
      <div className="container flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
        {items.map(([icon, label], index) => (
          <div
            key={label}
            className="inline-flex items-center gap-2.5 text-[0.8rem] font-medium text-zinc-500"
            style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(6px)", transition: `all .35s ${index * 0.08}s ease` }}
          >
            <i className={`bi ${icon} text-zinc-400`} style={{ fontSize: "0.9rem" }}></i>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Property Card ─── */

function PropertyCard({ property, onImageError }) {
  const available = normalizePropertyStatus(property?.propertyStatus || property?.status) === "available";
  return (
    <ListingCard
      imageSrc={withImage(property)}
      imageAlt={property.title || "Property"}
      title={property.title || "Property Listing"}
      location={property.location || "-"}
      price={propertyPriceLabel(property)}
      statusLabel={available ? "Available" : propertyStatusLabel(property)}
      actionTo={`/properties/${property.id}`}
      actionLabel="View"
      onImageError={(event) => onImageError(event, property)}
      className="mx-auto w-full max-w-[380px]"
    />
  );
}

/* ─── Listings ─── */

function Listings({ properties, totalCount, availableCount, query, onImageError }) {
  const ref = useRef(null);
  const visible = useInView(ref);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((property) => (
      [property.title, property.location, property.description, property.agent, property.propertyType, property.listingType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    ));
  }, [properties, query]);

  const perPage = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const shown = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page]);

  useEffect(() => {
    setPage((value) => Math.min(value, totalPages));
  }, [totalPages]);

  return (
    <Section id="listings" ref={ref} className="bg-white py-14 md:py-20">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-zinc-400">Featured Collection</span>
          <h2 className="mt-2 text-[1.55rem] font-bold tracking-tight text-zinc-900 md:text-[1.9rem]">Properties worth viewing next</h2>
          <p className="mt-1.5 text-[0.88rem] text-zinc-500">Handpicked homes and high-demand units available now.</p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-5 py-3 text-center">
            <span className="block text-[0.62rem] font-bold uppercase tracking-[0.12em] text-zinc-400">Listings Live</span>
            <strong className="mt-0.5 block text-2xl font-bold tracking-tight text-zinc-900">{totalCount}</strong>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-5 py-3 text-center">
            <span className="block text-[0.62rem] font-bold uppercase tracking-[0.12em] text-zinc-400">Ready To View</span>
            <strong className="mt-0.5 block text-2xl font-bold tracking-tight text-zinc-900">{availableCount}</strong>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((property, index) => (
          <div key={property.id} style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(12px)", transition: `all .35s ${index * 0.07}s ease` }}>
            <PropertyCard property={property} onImageError={onImageError} />
          </div>
        ))}
        {!shown.length ? (
          <div className="col-span-full flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50">
            <p className="text-sm text-zinc-400">No featured properties yet.</p>
          </div>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <div className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
          <button className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-[0.78rem] font-semibold text-zinc-500 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>
            <i className="bi bi-chevron-left"></i>
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((value) => (
            <button key={value} className={`inline-flex h-9 min-w-[36px] items-center justify-center rounded-lg text-[0.78rem] font-semibold transition-colors ${value === page ? "border border-zinc-900 bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"}`} onClick={() => setPage(value)}>{value}</button>
          ))}
          <button className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-[0.78rem] font-semibold text-zinc-500 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((v) => Math.min(totalPages, v + 1))}>
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
      ) : null}
    </Section>
  );
}

/* ─── How It Works ─── */

function HowItWorks() {
  const ref = useRef(null);
  const visible = useInView(ref);
  const steps = [
    { num: "01", icon: "bi-search", title: "Browse Listings", desc: "Explore verified properties with real photos, specs, and pricing. Filter by location and budget." },
    { num: "02", icon: "bi-calendar3", title: "Pick Your Schedule", desc: "Choose a date and time from real availability. See office hours and book 24hrs in advance." },
    { num: "03", icon: "bi-check-circle", title: "Confirm & Visit", desc: "Review details, confirm your booking, and receive a reference number with email confirmation." }
  ];

  return (
    <Section id="how" ref={ref} className="bg-zinc-50 py-14 md:py-20">
      <div className="text-center">
        <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-zinc-400">Simple Process</span>
        <h2 className="mt-2 text-[1.55rem] font-bold tracking-tight text-zinc-900 md:text-[1.9rem]">How It Works</h2>
        <p className="mt-1.5 text-[0.88rem] text-zinc-500">From search to viewing in three easy steps.</p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {steps.map((step, index) => (
          <div
            key={step.num}
            className="group relative overflow-hidden rounded-2xl border border-zinc-100 bg-white p-7 shadow-sm transition-shadow hover:shadow-md"
            style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(10px)", transition: `all .4s ${index * 0.1}s ease` }}
          >
            <span className="absolute -right-1 -top-2 text-[4.5rem] font-black leading-none text-zinc-100 transition-colors group-hover:text-zinc-200">{step.num}</span>
            <div className="relative">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm">
                <i className={`bi ${step.icon}`} style={{ fontSize: "1rem" }}></i>
              </span>
              <h3 className="mt-5 text-[0.98rem] font-bold tracking-tight text-zinc-900">{step.title}</h3>
              <p className="mt-2 text-[0.84rem] leading-relaxed text-zinc-500">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ─── CTA ─── */

function CTA({ navTarget }) {
  return (
    <Section id="site-cta" className="bg-zinc-900 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-[1.6rem] font-bold tracking-tight text-white md:text-[2.2rem]">Ready to find your next home?</h2>
        <p className="mx-auto mt-4 max-w-lg text-[0.9rem] leading-relaxed text-zinc-400">
          Book a free property viewing today and let our trusted agents guide you through every step.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to={navTarget.primaryTo} className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-7 text-[0.88rem] font-semibold text-zinc-900 no-underline transition-colors hover:bg-zinc-100 sm:w-auto">Start Booking</Link>
          <a href="#site-cta" className="inline-flex h-12 items-center justify-center rounded-xl border border-zinc-600 bg-transparent px-7 text-[0.88rem] font-semibold text-white no-underline transition-colors hover:border-zinc-400 hover:bg-zinc-800 sm:w-auto">Contact an Agent</a>
        </div>
      </div>
    </Section>
  );
}

/* ─── Footer ─── */

function Footer() {
  return (
    <footer className="border-t border-zinc-100 bg-white py-6">
      <div className="container flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Link to="/" className="inline-flex items-center gap-2.5 no-underline">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 text-white">
            <i className="bi bi-buildings" style={{ fontSize: "0.8rem" }}></i>
          </span>
          <span className="leading-tight">
            <strong className="block text-[0.82rem] font-bold text-zinc-900">TES PROPERTY</strong>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Real Estate</span>
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-5 text-[0.82rem] text-zinc-500">
          <a href="#listings" className="no-underline transition-colors hover:text-zinc-900">Listings</a>
          <a href="#site-cta" className="no-underline transition-colors hover:text-zinc-900">Agents</a>
          <a href="#site-cta" className="no-underline transition-colors hover:text-zinc-900">Contact</a>
          <a href="#site-cta" className="no-underline transition-colors hover:text-zinc-900">Privacy</a>
        </nav>
        <small className="text-[0.72rem] text-zinc-400">&copy; 2026 TES PROPERTY Real Estate. All rights reserved.</small>
      </div>
    </footer>
  );
}

/* ─── Main Page ─── */

export default function Home() {
  const [properties, setProperties] = useState(() => safeArray("allProperties").filter(isDisplayableProperty));
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [query, setQuery] = useState("");

  useEffect(() => {
    const refresh = () => {
      setProperties(safeArray("allProperties").filter(isDisplayableProperty));
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

  const featuredProperty = rankedProperties[0] || null;
  const totalCount = properties.length;
  const availableCount = properties.filter((p) => normalizePropertyStatus(p?.propertyStatus || p?.status) === "available").length;
  const navTarget = navTargetForUser(currentUser);
  const handleImageError = (event, property) => { applyPropertyImageFallback(event, property); };

  const heroStats = [
    { label: "Active Listings", value: `${totalCount}+` },
    { label: "Available Today", value: `${availableCount}+` },
    { label: "Avg Response", value: "24hr" }
  ];

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <Topbar navTarget={navTarget} />
      <Hero property={featuredProperty} stats={heroStats} navTarget={navTarget} query={query} setQuery={setQuery} onImageError={handleImageError} />
      <TrustBar />
      <Listings properties={rankedProperties} totalCount={totalCount} availableCount={availableCount} query={query} onImageError={handleImageError} />
      <HowItWorks />
      <CTA navTarget={navTarget} />
      <Footer />
    </div>
  );
}
