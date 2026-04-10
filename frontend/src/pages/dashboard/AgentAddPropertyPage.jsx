import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, saveArray, safeArray } from "@/services/storageService.js";
import { apiRequest } from "@/api/client.js";
import DashboardLayout from "@/layout/DashboardLayout.jsx";
import UIFeedback from "@/ui/UIFeedback.jsx";
import { AGENT_NAV_ITEMS } from "@/data/constants.js";
import {
  applyPropertyImageFallback,
  autoPropertyImage,
  propertyAssetImageNames,
  resolvePropertyImageSource
} from "@/utils/domain.js";
import useUiFeedback from "@/hooks/useUiFeedback.js";
import { cleanText, toNonNegativeNumber } from "@/utils/input.js";

const PROPERTY_IMAGE_SLOT_COUNT = 5;
const PROPERTY_IMAGE_EXTENSION_RE = /\.(png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i;

const emptyImageFields = () => Array.from({ length: PROPERTY_IMAGE_SLOT_COUNT }, () => "");

const cleanImageInput = (value) => {
  const c = String(value || "").trim().replace(/\\/g, "/");
  if (!c) return "";
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(c)) return c;
  if (c.startsWith("/")) return PROPERTY_IMAGE_EXTENSION_RE.test(c) ? c : "";
  return PROPERTY_IMAGE_EXTENSION_RE.test(c) ? c : "";
};

const imagePayloadFrom = (imageUrls) => {
  const next = [];
  const seen = new Set();
  (Array.isArray(imageUrls) ? imageUrls : []).forEach((v) => {
    const c = cleanImageInput(v);
    if (!c || seen.has(c)) return;
    seen.add(c);
    next.push(c);
  });
  return next.slice(0, PROPERTY_IMAGE_SLOT_COUNT);
};

const saveErrorMessage = (error, fallback) => {
  const message = String(error?.message || "").trim();
  if (/payload too large/i.test(message)) return "Upload limit exceeded. Restart the backend and try again.";
  return message || fallback;
};

const initialForm = () => ({
  title: "", location: "", price: "", propertyType: "property",
  propertyStatus: "available", bedrooms: "", bathrooms: "",
  areaSqft: "", description: "", imageUrls: emptyImageFields()
});

export default function AgentAddPropertyPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const feedback = useUiFeedback();
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const updateImageAt = (i, value) => {
    setForm((s) => ({
      ...s,
      imageUrls: Array.from({ length: PROPERTY_IMAGE_SLOT_COUNT }, (_, idx) =>
        idx === i ? value : (s.imageUrls?.[idx] || ""))
    }));
  };

  const removeImageAt = (i) => {
    setForm((s) => {
      const imgs = s.imageUrls?.slice(0, PROPERTY_IMAGE_SLOT_COUNT) || [];
      imgs.splice(i, 1, "");
      return { ...s, imageUrls: Array.from({ length: PROPERTY_IMAGE_SLOT_COUNT }, (_, idx) => imgs[idx] || "") };
    });
  };

  const fillDetectedImages = () => {
    setForm((s) => ({
      ...s,
      imageUrls: Array.from({ length: PROPERTY_IMAGE_SLOT_COUNT }, (_, idx) =>
        propertyAssetImageNames[idx] || (s.imageUrls?.[idx] || ""))
    }));
  };

  const handleImageError = (e, prop) => applyPropertyImageFallback(e.currentTarget, prop || { title: "Property" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const title = cleanText(form.title, 90);
    const location = cleanText(form.location, 120);
    const description = cleanText(form.description, 500);
    const price = toNonNegativeNumber(form.price, -1);
    const propertyType = cleanText(form.propertyType || "property", 40).toLowerCase();
    const propertyStatus = String(form.propertyStatus || "available").toLowerCase();
    const bedrooms = toNonNegativeNumber(form.bedrooms, 0);
    const bathrooms = toNonNegativeNumber(form.bathrooms, 0);
    const areaSqft = toNonNegativeNumber(form.areaSqft, 0);
    const imageSlots = imagePayloadFrom(form.imageUrls);
    const coverImage = imageSlots[0] || "";
    const galleryImages = imageSlots.slice(1, PROPERTY_IMAGE_SLOT_COUNT);

    if (!title || !location || price <= 0) {
      feedback.notify("Title, location, and price are required.", "error");
      return;
    }
    try {
      setSaving(true);
      const res = await apiRequest("/api/properties", {
        method: "POST",
        body: JSON.stringify({
          title, location, price, listingType: "sale", propertyType,
          propertyStatus, bedrooms, bathrooms, areaSqft, description,
          imageUrl: coverImage, imageUrls: galleryImages, agent: user.username
        })
      });
      const saved = res?.data;
      if (!saved?.id) throw new Error("Property was not saved by the server.");
      const savedImageUrls = Array.isArray(saved.imageUrls) ? saved.imageUrls : galleryImages;
      const next = { ...saved, imageUrl: saved.imageUrl || coverImage || autoPropertyImage(saved), imageUrls: savedImageUrls };
      const existing = safeArray("allProperties");
      saveArray("allProperties", [next, ...existing.filter((p) => String(p?.id || "") !== String(next.id))]);
      feedback.notify("Property saved.", "success");
      navigate("/agent", { state: { section: "properties" } });
    } catch (error) {
      feedback.notify(saveErrorMessage(error, "Unable to save property."), "error");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <DashboardLayout
      suiteLabel="Agent Suite"
      profileName={user.fullName || user.username}
      profileRole="Agent"
      role="agent"
      navItems={AGENT_NAV_ITEMS}
      activeTab="properties"
      onTabChange={(s) => navigate("/agent", { state: { section: s } })}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 10px" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>Add New Property</h1>
          <button className="btn btn-outline-dark btn-sm" onClick={() => navigate("/agent", { state: { section: "properties" } })}>
            <i className="bi bi-arrow-left me-1"></i>Back to Properties
          </button>
        </div>

        <section className="agent-panel">
          <form onSubmit={handleSubmit}>
            <div className="row g-2">
              <div className="col-md-6">
                <label className="form-label small text-muted mb-1">Title *</label>
                <input className="form-control" placeholder="Property title" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
              </div>
              <div className="col-md-6">
                <label className="form-label small text-muted mb-1">Location *</label>
                <input className="form-control" placeholder="City, area" value={form.location} onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))} />
              </div>
              <div className="col-md-4">
                <label className="form-label small text-muted mb-1">Price *</label>
                <input className="form-control" type="number" placeholder="0" value={form.price} onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))} />
              </div>
              <div className="col-md-4">
                <label className="form-label small text-muted mb-1">Property Type</label>
                <select className="form-select" value={form.propertyType} onChange={(e) => setForm((s) => ({ ...s, propertyType: e.target.value }))}>
                  <option value="property">Property</option>
                  <option value="house">House</option>
                  <option value="apartment">Apartment</option>
                  <option value="condo">Condo</option>
                  <option value="dorm">Dorm</option>
                  <option value="land">Land</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label small text-muted mb-1">Status</label>
                <select className="form-select" value={form.propertyStatus} onChange={(e) => setForm((s) => ({ ...s, propertyStatus: e.target.value }))}>
                  <option value="available">Available</option>
                  <option value="reserved">Reserved</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label small text-muted mb-1">Bedrooms</label>
                <input className="form-control" type="number" placeholder="0" value={form.bedrooms} onChange={(e) => setForm((s) => ({ ...s, bedrooms: e.target.value }))} />
              </div>
              <div className="col-md-4">
                <label className="form-label small text-muted mb-1">Bathrooms</label>
                <input className="form-control" type="number" placeholder="0" value={form.bathrooms} onChange={(e) => setForm((s) => ({ ...s, bathrooms: e.target.value }))} />
              </div>
              <div className="col-md-4">
                <label className="form-label small text-muted mb-1">Area (sqft)</label>
                <input className="form-control" type="number" placeholder="0" value={form.areaSqft} onChange={(e) => setForm((s) => ({ ...s, areaSqft: e.target.value }))} />
              </div>
              <div className="col-12">
                <label className="form-label small text-muted mb-1">Description</label>
                <textarea className="form-control" rows="3" placeholder="Property description..." value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
              </div>

              <div className="col-12" style={{ marginTop: 8 }}>
                <label className="form-label small text-muted mb-1">Property Images</label>
                <div className="small text-muted mb-2">
                  Enter image filenames or URLs. Slot 1 is the cover image.
                </div>
              </div>
              {propertyAssetImageNames.length > 0 && (
                <div className="col-12">
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <span className="small text-muted">Detected: {propertyAssetImageNames.join(", ")}</span>
                    <button type="button" className="btn btn-outline-dark btn-sm" onClick={fillDetectedImages}>Use Detected</button>
                  </div>
                </div>
              )}
              {form.imageUrls.map((url, i) => {
                const preview = resolvePropertyImageSource(url);
                return (
                  <div key={`img-${i}`} className="col-md-6">
                    <label className="form-label small text-muted mb-1">Image {i + 1}{i === 0 ? " (cover)" : ""}</label>
                    <div className="d-flex gap-2">
                      <input
                        className="form-control"
                        placeholder={i === 0 ? "cover-photo.jpg" : `image-${i + 1}.jpg`}
                        value={url}
                        onChange={(e) => updateImageAt(i, e.target.value)}
                        onBlur={(e) => updateImageAt(i, cleanImageInput(e.target.value))}
                      />
                      {url && (
                        <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => removeImageAt(i)}>Clear</button>
                      )}
                    </div>
                    {preview && (
                      <div className="mt-2 overflow-hidden" style={{ borderRadius: 8, border: "1px solid var(--line-soft)" }}>
                        <img
                          src={preview} alt={`Preview ${i + 1}`} className="w-100"
                          style={{ aspectRatio: "4/3", objectFit: "contain", background: "#f4f4f5" }}
                          onError={(e) => handleImageError(e, { title: form.title || "Property", location: form.location || "" })}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="d-flex gap-2 mt-3">
              <button className="btn btn-dark" disabled={saving}>
                {saving ? "Saving..." : "Save Property"}
              </button>
              <button type="button" className="btn btn-outline-dark" disabled={saving} onClick={() => setForm(initialForm())}>
                Clear
              </button>
              <button type="button" className="btn btn-outline-dark" disabled={saving} onClick={() => navigate("/agent", { state: { section: "properties" } })}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      <UIFeedback
        toasts={feedback.toasts}
        closeToast={feedback.closeToast}
        confirmState={feedback.confirmState}
        cancelConfirm={feedback.cancelConfirm}
        confirm={feedback.confirm}
      />
    </DashboardLayout>
  );
}
