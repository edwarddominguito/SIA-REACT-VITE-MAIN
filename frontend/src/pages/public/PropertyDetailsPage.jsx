import { useEffect, useMemo, useState } from "react";
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
  const [selectedImage, setSelectedImage] = useState("");
  const property = useMemo(
    () => properties.find((item) => String(item?.id) === String(params.id) && isDisplayableProperty(item)),
    [properties, params.id]
  );
  const coverImage = useMemo(() => propertyCoverImage(property || {}), [property]);
  const galleryImages = useMemo(() => propertyGalleryImages(property || {}, { includeCover: false }), [property]);
  const thumbnailImages = useMemo(() => {
    const images = [];
    const seen = new Set();
    const push = (imageSrc) => {
      const candidate = String(imageSrc || "").trim();
      if (!candidate || seen.has(candidate)) return;
      seen.add(candidate);
      images.push(candidate);
    };

    push(coverImage);
    galleryImages.forEach(push);
    return images.slice(0, 5);
  }, [coverImage, galleryImages]);
  const featuredImage = selectedImage || thumbnailImages[0] || coverImage || withImage(property);
  const previewImages = useMemo(() => {
    const images = [];
    const seen = new Set(featuredImage ? [featuredImage] : []);
    thumbnailImages.forEach((imageSrc) => {
      const candidate = String(imageSrc || "").trim();
      if (!candidate || seen.has(candidate)) return;
      seen.add(candidate);
      images.push(candidate);
    });
    return images.slice(0, 4);
  }, [featuredImage, thumbnailImages]);

  useEffect(() => {
    const refresh = () => {
      setUser(getCurrentUser());
      setProperties(safeArray("allProperties").filter(isDisplayableProperty));
    };
    refresh();
    return subscribeKeys(["allProperties", "currentUser"], refresh);
  }, []);

  useEffect(() => {
    setSelectedImage(coverImage || "");
  }, [coverImage, property?.id]);

  const goBack = () => {
    const from = location.state?.from;
    if (typeof from === "string" && from.trim()) {
      navigate(from);
      return;
    }
    if (from && typeof from === "object" && typeof from.pathname === "string" && from.pathname.trim()) {
      navigate(from.pathname, { state: from.state || null });
      return;
    }
    navigate(user ? "/dashboard" : "/");
  };

  const handleImageError = (event) => {
    applyPropertyImageFallback(event.currentTarget, property || {});
  };

  return (
    <div className="min-h-screen bg-zinc-100/50 text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="container flex min-h-[76px] flex-wrap items-center justify-between gap-3 py-3 sm:flex-nowrap sm:gap-4">
          <div className="inline-flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-black text-white">
              <i className="bi bi-buildings"></i>
            </span>
            <span className="leading-tight">
              <strong className="block text-base font-semibold tracking-tight text-zinc-950">TES PROPERTY</strong>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">REAL ESTATE</span>
            </span>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button variant="secondary" onClick={goBack} className="flex-1 sm:flex-none">Back</Button>
            {!user ? <Button as={Link} to="/login" className="flex-1 sm:flex-none">Login</Button> : null}
          </div>
        </div>
      </header>

      <Section className="pb-10 pt-6 md:pb-16 md:pt-10" containerClassName="max-w-7xl">
        {!property ? (
          <Card className="grid min-h-[240px] place-items-center text-center">
            <div className="space-y-2">
              <i className="bi bi-exclamation-circle text-2xl text-zinc-500"></i>
              <p className="typo-body">Property not found.</p>
            </div>
          </Card>
        ) : (
            <div className="space-y-4 md:space-y-6">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                <h1 className="max-w-5xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl md:text-5xl">
                  {property.title || "Property"}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base text-zinc-700 sm:text-lg">
                  <span className="inline-flex items-center gap-2">
                    <i className="bi bi-geo-alt text-zinc-500"></i>
                    {property.location || "-"}
                  </span>
                  <span className="text-zinc-400">&middot;</span>
                  <span>{property.bedrooms || "-"} bed</span>
                  <span>{property.bathrooms || "-"} bath</span>
                  <span>{property.areaSqft || "-"} sqft</span>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg bg-white">
              {previewImages.length ? (
                <div className="grid gap-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
                  <button
                    type="button"
                    className="group relative overflow-hidden text-left"
                    onClick={() => setSelectedImage(featuredImage)}
                  >
                    <div className="aspect-[4/3]">
                      <img
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.01]"
                        src={featuredImage}
                        alt={property.title || "Property"}
                        onError={handleImageError}
                      />
                    </div>
                  </button>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {previewImages.map((imageSrc, index) => (
                      <button
                        key={`${imageSrc}-${index}`}
                        type="button"
                        className={`group relative overflow-hidden text-left transition ${selectedImage === imageSrc ? "ring-2 ring-zinc-900 ring-offset-1 ring-offset-white" : ""}`}
                        onClick={() => setSelectedImage(imageSrc)}
                      >
                        <div className="aspect-[4/3]">
                          <img
                            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.01]"
                            src={imageSrc}
                            alt={`${property.title || "Property"} view ${index + 2}`}
                            onError={handleImageError}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg">
                  <div className="aspect-[16/10]">
                    <img
                      className="h-full w-full object-cover"
                      src={featuredImage}
                      alt={property.title || "Property"}
                      onError={handleImageError}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
              <div className="space-y-4 sm:space-y-6">
                <div className="space-y-3 border-b border-zinc-200 pb-4 sm:pb-6">
                  <div className="flex flex-wrap gap-2.5">
                    <span className="ui-badge border border-zinc-200 bg-zinc-100 text-zinc-700">{propertyStatusLabel(property)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                    <div className="rounded-lg border border-zinc-200 bg-white p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Bedrooms</div>
                      <div className="mt-1 text-lg font-semibold text-zinc-950">{property.bedrooms || "-"}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-white p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Bathrooms</div>
                      <div className="mt-1 text-lg font-semibold text-zinc-950">{property.bathrooms || "-"}</div>
                    </div>
                    <div className="col-span-2 rounded-lg border border-zinc-200 bg-white p-3 sm:col-span-1">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Area</div>
                      <div className="mt-1 text-lg font-semibold text-zinc-950">{property.areaSqft || "-"} sqft</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Overview</div>
                  <p className="typo-body max-w-3xl leading-6 text-zinc-700 text-sm sm:leading-7 sm:text-base">
                    {property.description || "No description available."}
                  </p>
                </div>
              </div>
              <Card className="h-fit rounded-lg p-4 sm:p-5 lg:sticky lg:top-24">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Price</div>
                    <div className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">{propertyPriceLabel(property)}</div>
                  </div>
                  <div className="space-y-2 rounded-lg bg-zinc-50 p-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-zinc-700">
                      <span>Status</span>
                      <span className="font-semibold text-zinc-950">{propertyStatusLabel(property)}</span>
                    </div>
                  </div>
                  {!user ? (
                    <div className="pt-1">
                      <Button as={Link} to="/register" size="cta" className="w-full">Register to Book</Button>
                    </div>
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
