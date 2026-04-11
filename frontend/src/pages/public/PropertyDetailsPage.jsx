import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { getCurrentUser, safeArray, subscribeKeys } from "@/services/storageService.js";
import {
  withImage,
  applyPropertyImageFallback,
  propertyCoverImage,
  propertyGalleryImages,
  isDisplayableProperty,
  listingTypeLabel,
  propertyPriceLabel,
  propertyStatusLabel
} from "@/utils/domain.js";
import { Button, Card, Section } from "@/components/ui/index.js";

export default function PublicPropertyDetails() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getCurrentUser());
  const [properties, setProperties] = useState(() => safeArray("allProperties").filter(isDisplayableProperty));
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const property = useMemo(
    () => properties.find((item) => String(item?.id) === String(params.id) && isDisplayableProperty(item)),
    [properties, params.id]
  );
  const coverImage = useMemo(() => propertyCoverImage(property || {}), [property]);
  const galleryImages = useMemo(() => propertyGalleryImages(property || {}, { includeCover: false }), [property]);

  // All images in order, deduplicated
  const allImages = useMemo(() => {
    const images = [];
    const seen = new Set();
    const push = (src) => {
      const s = String(src || "").trim();
      if (!s || seen.has(s)) return;
      seen.add(s);
      images.push(s);
    };
    push(coverImage);
    galleryImages.forEach(push);
    return images;
  }, [coverImage, galleryImages]);

  const featuredImage = allImages[0] || coverImage || withImage(property);
  const thumbnails = allImages.slice(1, 5);

  useEffect(() => {
    const refresh = () => {
      setUser(getCurrentUser());
      setProperties(safeArray("allProperties").filter(isDisplayableProperty));
    };
    refresh();
    return subscribeKeys(["allProperties", "currentUser"], refresh);
  }, []);

  const openLightbox = useCallback((index) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevImage = useCallback(() => setLightboxIndex((i) => (i - 1 + allImages.length) % allImages.length), [allImages.length]);
  const nextImage = useCallback(() => setLightboxIndex((i) => (i + 1) % allImages.length), [allImages.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prevImage();
      if (e.key === "ArrowRight") nextImage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, closeLightbox, prevImage, nextImage]);

  const goBack = () => {
    const from = location.state?.from;
    if (typeof from === "string" && from.trim()) { navigate(from); return; }
    if (from && typeof from === "object" && typeof from.pathname === "string" && from.pathname.trim()) {
      navigate(from.pathname, { state: from.state || null }); return;
    }
    navigate(user ? "/dashboard" : "/");
  };

  const handleImageError = (event) => {
    applyPropertyImageFallback(event.currentTarget, property || {});
  };

  return (
    <div className="min-h-screen bg-zinc-100/50 text-zinc-900">

      {/* ── Lightbox ─────────────────────────────────────────────── */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
            aria-label="Close"
          >
            <i className="bi bi-x-lg text-base"></i>
          </button>

          <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white select-none">
            {lightboxIndex + 1} / {allImages.length}
          </div>

          {allImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevImage(); }}
              className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
              aria-label="Previous"
            >
              <i className="bi bi-chevron-left text-lg"></i>
            </button>
          )}

          <div className="max-h-[88vh] max-w-[88vw]" onClick={(e) => e.stopPropagation()}>
            <img
              className="max-h-[88vh] max-w-[88vw] rounded-lg object-contain shadow-2xl"
              src={allImages[lightboxIndex]}
              alt={`${property?.title || "Property"} image ${lightboxIndex + 1}`}
              onError={handleImageError}
            />
          </div>

          {allImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
              className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
              aria-label="Next"
            >
              <i className="bi bi-chevron-right text-lg"></i>
            </button>
          )}

          {allImages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {allImages.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
                  className={`h-10 w-14 overflow-hidden rounded transition ${i === lightboxIndex ? "ring-2 ring-white" : "opacity-50 hover:opacity-80"}`}
                >
                  <img className="h-full w-full object-cover" src={src} alt="" onError={handleImageError} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="container flex min-h-[52px] flex-wrap items-center justify-between gap-2 py-2 sm:flex-nowrap sm:gap-3">
          <div className="inline-flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-black text-white text-sm">
              <i className="bi bi-buildings"></i>
            </span>
            <span className="leading-tight">
              <strong className="block text-sm font-semibold tracking-tight text-zinc-950">TES PROPERTY</strong>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">REAL ESTATE</span>
            </span>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button variant="secondary" onClick={goBack} className="flex-1 sm:flex-none">Back</Button>
            {!user ? <Button as={Link} to="/login" className="flex-1 sm:flex-none">Login</Button> : null}
          </div>
        </div>
      </header>

      <Section className="py-4" containerClassName="max-w-7xl">
        {!property ? (
          <Card className="grid min-h-[240px] place-items-center text-center">
            <div className="space-y-2">
              <i className="bi bi-exclamation-circle text-2xl text-zinc-500"></i>
              <p className="typo-body">Property not found.</p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_340px] lg:items-start lg:gap-5">

            {/* LEFT — Gallery */}
            <div className="overflow-hidden rounded-lg bg-zinc-100">
              {/* Main image */}
              <button
                type="button"
                className="group relative block w-full overflow-hidden text-left"
                onClick={() => openLightbox(0)}
                title="Click to zoom"
              >
                <div className="aspect-[16/9]">
                  <img
                    className="h-full w-full object-cover transition duration-200 group-hover:brightness-95"
                    src={featuredImage}
                    alt={property.title || "Property"}
                    onError={handleImageError}
                  />
                </div>
                <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 group-hover:opacity-100 transition pointer-events-none">
                  <i className="bi bi-zoom-in"></i> View
                </div>
              </button>

              {/* Thumbnails */}
              {thumbnails.length > 0 && (
                <div className="grid gap-[2px] mt-[2px]" style={{ gridTemplateColumns: `repeat(${thumbnails.length}, minmax(0,1fr))` }}>
                  {thumbnails.map((src, i) => (
                    <button
                      key={`thumb-${i}`}
                      type="button"
                      className="group relative overflow-hidden bg-zinc-200 text-left"
                      onClick={() => openLightbox(i + 1)}
                      title="Click to zoom"
                    >
                      <div className="aspect-[16/9]">
                        <img
                          className="h-full w-full object-cover transition duration-200 group-hover:brightness-90"
                          src={src}
                          alt={`${property.title || "Property"} view ${i + 2}`}
                          onError={handleImageError}
                        />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none">
                        <span className="rounded-full bg-black/40 p-1.5 text-white text-xs">
                          <i className="bi bi-zoom-in"></i>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT — Details */}
            <div className="flex flex-col gap-3">
              {/* Title & location */}
              <div className="space-y-1">
                <h1 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                  {property.title || "Property"}
                </h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
                  <i className="bi bi-geo-alt text-zinc-400"></i>
                  <span>{property.location || "-"}</span>
                </div>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Bedrooms</div>
                  <div className="mt-0.5 text-base font-semibold text-zinc-950">{property.bedrooms || "-"}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Bathrooms</div>
                  <div className="mt-0.5 text-base font-semibold text-zinc-950">{property.bathrooms || "-"}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Area</div>
                  <div className="mt-0.5 text-base font-semibold text-zinc-950">{property.areaSqft || "-"} sqft</div>
                </div>
              </div>

              {/* Status badge */}
              <div>
                <span className="ui-badge border border-zinc-200 bg-zinc-100 text-zinc-700">{propertyStatusLabel(property)}</span>
              </div>

              {/* Description */}
              <div className="space-y-1 border-t border-zinc-200 pt-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Overview</div>
                <p className="leading-5 text-zinc-700 text-sm line-clamp-4">
                  {property.description || "No description available."}
                </p>
              </div>

              {/* Price card */}
              <Card className="rounded-lg p-3 mt-auto">
                <div className="space-y-2.5">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Price</div>
                    <div className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">{propertyPriceLabel(property)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                    <span>Status</span>
                    <span className="font-semibold text-zinc-950">{propertyStatusLabel(property)}</span>
                  </div>
                  {!user ? (
                    <Button as={Link} to="/register" size="cta" className="w-full">Register to Book</Button>
                  ) : null}
                </div>
              </Card>
            </div>

          </div>
        )}
      </Section>
    </div>
  );
}
