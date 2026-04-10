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

function districtFromLocation(location) {
  const raw = String(location || "").trim();
  return raw ? (raw.split(",")[0]?.trim() || raw) : "Davao";
}

function navTargetForUser(user) {
  if (!user) {
    return {
      primaryTo: "/register",
      primaryLabel: "Get Started",
      heroLabel: "Start Booking",
      secondaryTo: "/login",
      secondaryLabel: "Sign in"
    };
  }
  if (user.role === "customer") {
    return {
      primaryTo: "/customer/book-appointment",
      primaryLabel: "Dashboard",
      heroLabel: "Start Booking",
      secondaryTo: "/dashboard",
      secondaryLabel: "Sign in"
    };
  }
  return {
    primaryTo: "/dashboard",
    primaryLabel: "Dashboard",
    heroLabel: "Open Dashboard",
    secondaryTo: "/dashboard",
    secondaryLabel: "Sign in"
  };
}

function Topbar({ navTarget }) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="container flex min-h-[80px] flex-wrap items-center justify-between gap-4 py-3 sm:flex-nowrap sm:gap-6">
        <Link to="/" className="inline-flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-black text-white">
            <i className="bi bi-house-door"></i>
          </span>
          <span className="leading-tight">
            <strong className="block text-base font-semibold tracking-tight text-zinc-950">TES PROPERTY</strong>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">REAL ESTATE</span>
          </span>
        </Link>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto md:gap-3">
          <nav className="hidden items-center gap-7 md:flex" aria-label="Landing navigation">
            <a href="#listings" className="text-sm font-semibold text-zinc-600 no-underline hover:text-zinc-900">Listings</a>
            <a href="#how" className="text-sm font-semibold text-zinc-600 no-underline hover:text-zinc-900">How it Works</a>
            <a href="#site-cta" className="text-sm font-semibold text-zinc-600 no-underline hover:text-zinc-900">Agents</a>
          </nav>

          <Button as={Link} to={navTarget.secondaryTo} variant="secondary" className="hidden sm:inline-flex">{navTarget.secondaryLabel}</Button>
          <Button as={Link} to={navTarget.primaryTo} className="w-full sm:w-auto">{navTarget.primaryLabel}</Button>
        </div>
      </div>
    </header>
  );
}

function Hero({ property, stats, navTarget, query, setQuery, onImageError }) {
  return (
    <Section className="pb-10 pt-8 md:pb-16 md:pt-14">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(420px,1.14fr)] lg:items-start">
        <div className="space-y-7">
          <span className="ui-badge border border-zinc-200 bg-zinc-100 text-zinc-700">Davao Booking Platform</span>
          <h1 className="typo-hero max-w-none text-zinc-950 sm:max-w-[15ch]">
            Find the right home, then book the visit without the <span className="text-zinc-500">guesswork.</span>
          </h1>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button as={Link} to={navTarget.primaryTo} size="cta" className="w-full sm:w-auto">
              {navTarget.heroLabel}
              <i className="bi bi-arrow-right"></i>
            </Button>
            <Button as="a" href="#listings" variant="secondary" size="cta" className="w-full sm:w-auto">Browse Featured Homes</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                className="h-full p-5"
              />
            ))}
          </div>
        </div>

        {property ? (
          <Card className="overflow-hidden p-0">
            {/* Full-width image with gradient overlay */}
            <div className="relative">
              <div className="aspect-[16/9] min-h-[280px] w-full overflow-hidden md:min-h-[340px]">
                <img
                  src={withImage(property)}
                  alt={property.title || "Featured property"}
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
                  onError={(event) => onImageError(event, property)}
                />
              </div>
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              {/* Top badges */}
              <div className="absolute left-4 top-4 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-900/80 text-white shadow backdrop-blur-sm">
                  <i className="bi bi-house-door"></i>
                </span>
                <span className="inline-flex h-7 items-center rounded-full border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white backdrop-blur-sm">
                  Featured Right Now
                </span>
              </div>
              {/* Text overlaid at bottom of image */}
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <h3 className="font-bold leading-tight tracking-tight text-white drop-shadow-sm" style={{ fontSize: "clamp(1.4rem, 2.8vw, 2.2rem)" }}>
                  {property.title || "Property Listing"}
                </h3>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/80">
                  <i className="bi bi-geo-alt"></i>
                  <span>{property.location || "-"}</span>
                </p>
              </div>
            </div>
            {/* Bottom info strip */}
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {propertySpecs(property).map((item) => (
                    <span key={item} className="ui-badge border border-zinc-200 bg-zinc-50 text-zinc-700">{item}</span>
                  ))}
                </div>
                <strong className="text-[1.9rem] font-semibold tracking-tight text-zinc-950 md:text-[2.2rem]">{propertyPriceLabel(property)}</strong>
              </div>
              <Button as={Link} to={`/properties/${property.id}`} state={{ from: "/" }} className="w-full shrink-0 bg-black text-white hover:bg-zinc-900 sm:w-auto">
                View Property
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            <p className="typo-body text-zinc-700">
              TES PROPERTY gives buyers and renters one clean place to compare verified listings, check viewing
              availability, and move faster with trusted local agents.
            </p>
            <SearchBar
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, location, listing type, or agent"
              className="h-auto flex-col items-stretch gap-3 rounded-3xl px-4 py-4 sm:h-14 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-0"
              inputClassName="w-full text-sm sm:text-base"
              action={
                <a
                  href="#listings"
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-zinc-300 px-4 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 sm:h-9 sm:w-auto"
                >
                  Go
                </a>
              }
            />
          </div>
        )}
      </div>
    </Section>
  );
}

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
    <section ref={ref} className="border-y border-zinc-800 bg-black py-4">
      <div className="container flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        {items.map(([icon, label], index) => (
          <div
            key={label}
            className="inline-flex items-center gap-2 text-sm text-zinc-200"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(8px)",
              transition: `all .35s ${index * 0.08}s ease`
            }}
          >
            <i className={`bi ${icon}`}></i>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

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
      className="mx-auto w-full max-w-[352px]"
    />
  );
}

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
    <Section id="listings" ref={ref} className="bg-zinc-100/50">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <SectionHeader
          kicker="Featured Collection"
          title="Properties worth viewing next"
          description="Handpicked homes and high-demand units available now."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard label="Listings Live" value={String(totalCount)} className="min-w-[152px] p-5" />
          <StatCard label="Ready To View" value={String(availableCount)} className="min-w-[152px] p-5" />
        </div>
      </div>

      <div className="mt-9 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((property, index) => (
          <div
            key={property.id}
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(12px)",
              transition: `all .35s ${index * 0.07}s ease`
            }}
          >
            <PropertyCard property={property} onImageError={onImageError} />
          </div>
        ))}

        {!shown.length ? (
          <Card className="grid min-h-[220px] place-items-center border-dashed text-center">
            <p className="typo-body">No featured properties yet.</p>
          </Card>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</Button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => (
            <Button
              key={value}
              variant={value === page ? "primary" : "secondary"}
              onClick={() => setPage(value)}
            >
              {value}
            </Button>
          ))}
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button>
        </div>
      ) : null}
    </Section>
  );
}

function HowItWorks() {
  const ref = useRef(null);
  const visible = useInView(ref);
  const steps = [
    {
      num: "01",
      icon: "bi-search",
      title: "Browse Listings",
      desc: "Explore verified properties with real photos, specs, and pricing. Filter by location and budget."
    },
    {
      num: "02",
      icon: "bi-calendar3",
      title: "Pick Your Schedule",
      desc: "Choose a date and time from real availability. See office hours and book 24hrs in advance."
    },
    {
      num: "03",
      icon: "bi-check-circle",
      title: "Confirm & Visit",
      desc: "Review details, confirm your booking, and receive a reference number with email confirmation."
    }
  ];

  return (
    <Section id="how" ref={ref} className="bg-white">
      <SectionHeader
        centered
        kicker="Simple Process"
        title="How It Works"
        description="From search to viewing in three easy steps."
      />

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((step, index) => (
          <Card
            key={step.num}
            className="relative flex min-h-[250px] h-full flex-col gap-4 p-6"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(10px)",
              transition: `all .35s ${index * 0.09}s ease`
            }}
          >
            <span className="absolute right-5 top-4 text-6xl font-semibold tracking-tight text-zinc-200">{step.num}</span>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-zinc-100 text-zinc-700">
              <i className={`bi ${step.icon}`}></i>
            </span>
            <h3 className="typo-card-title text-zinc-900">{step.title}</h3>
            <p className="typo-body">{step.desc}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function CTA({ navTarget }) {
  return (
    <Section id="site-cta" className="bg-zinc-950 text-white">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="typo-page-title text-white">Ready to find your next home?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-300 md:text-base">
          Book a free property viewing today and let our trusted agents guide you through every step.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          <Button as={Link} to={navTarget.primaryTo} variant="secondary" size="cta" className="w-full sm:w-auto">Start Booking</Button>
          <Button
            as="a"
            href="#site-cta"
            variant="ghost"
            size="cta"
            className="w-full !border-white/70 !text-white hover:!bg-white hover:!text-zinc-950 sm:w-auto"
          >
            Contact an Agent
          </Button>
        </div>
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-black py-5 text-zinc-300">
      <div className="container flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-zinc-700 text-zinc-200">
            <i className="bi bi-house-door"></i>
          </span>
          <span className="leading-tight">
            <strong className="block text-sm font-semibold text-zinc-100">TES PROPERTY</strong>
            <span className="typo-caption uppercase tracking-[0.12em] text-zinc-500">REAL ESTATE</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400 sm:gap-5">
          <a href="#listings" className="no-underline hover:text-zinc-200">Listings</a>
          <a href="#site-cta" className="no-underline hover:text-zinc-200">Agents</a>
          <a href="#site-cta" className="no-underline hover:text-zinc-200">Contact</a>
          <a href="#site-cta" className="no-underline hover:text-zinc-200">Privacy</a>
        </div>

        <small className="typo-caption text-zinc-500">(c) 2026 TES PROPERTY Real Estate. All rights reserved.</small>
      </div>
    </footer>
  );
}

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
    <div className="min-h-screen bg-white text-zinc-900">
      <Topbar navTarget={navTarget} />
      <Hero
        property={spotlightProperty}
        stats={stats}
        navTarget={navTarget}
        query={query}
        setQuery={setQuery}
        onImageError={handleImageError}
      />
      <TrustBar />
      <Listings
        properties={rankedProperties}
        totalCount={rankedProperties.length}
        availableCount={availableCount}
        query={query}
        onImageError={handleImageError}
      />
      <HowItWorks />
      <CTA navTarget={navTarget} />
      <Footer />
    </div>
  );
}
