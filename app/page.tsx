"use client";

import { useEffect, useRef, useState } from "react";
import type { BufferGeometry, Material, Mesh, Vector3, WebGLRenderer } from "three";
import Lenis from "lenis";
import BookingExperience, { BookingButton } from "@/components/booking/BookingExperience";
import { bookingServices } from "@/lib/booking-config";
import { FaInstagram, FaWhatsapp } from "react-icons/fa";
import {
  ArrowDown,
  ArrowUpLeft,
  ArrowUpRight,
  Clock3,
  MapPin,
  Menu,
  Play,
  Scissors,
  X,
} from "lucide-react";

type Lang = "ar" | "en";
type Copy = { ar: string; en: string };
type ServiceItem = {
  name: Copy;
  duration: Copy;
  price: Copy;
  note?: Copy;
};
type ServiceGroup = {
  id: string;
  title: Copy;
  strap: Copy;
  items: ServiceItem[];
};

const contact = {
  whatsapp: "https://wa.me/962797799677",
  instagram: "https://www.instagram.com/mj.hairsalon/",
  maps: "https://maps.app.goo.gl/GVHunJTUDmJjRHor5",
};

const services: ServiceGroup[] = [
  {
    id: "hair",
    title: { ar: "الشعر واللحية", en: "Hair & Beard" },
    strap: { ar: "قصّ، عناية، لون", en: "Cut, care, colour" },
    items: [
      { name: { ar: "حلاقة شعر", en: "Haircut" }, duration: { ar: "30 دقيقة", en: "30 min" }, price: { ar: "12 د.أ", en: "12 JOD" } },
      { name: { ar: "حلاقة شعر + دقن", en: "Haircut + beard" }, duration: { ar: "45 دقيقة", en: "45 min" }, price: { ar: "15 د.أ", en: "15 JOD" } },
      { name: { ar: "حلاقة دقن", en: "Beard trim" }, duration: { ar: "15 دقيقة", en: "15 min" }, price: { ar: "8 د.أ", en: "8 JOD" } },
      { name: { ar: "حلاقة شعر أطفال", en: "Kids haircut" }, duration: { ar: "30 دقيقة", en: "30 min" }, price: { ar: "8 د.أ", en: "8 JOD" } },
      { name: { ar: "سشوار", en: "Blow dry" }, duration: { ar: "5 دقائق", en: "5 min" }, price: { ar: "5 د.أ", en: "5 JOD" } },
      { name: { ar: "ترتمنت للشعر", en: "Hair treatment" }, duration: { ar: "15 دقيقة", en: "15 min" }, price: { ar: "15 د.أ", en: "15 JOD" } },
      { name: { ar: "بروتين للشعر", en: "Hair protein" }, duration: { ar: "45 دقيقة", en: "45 min" }, price: { ar: "يبدأ من 35 د.أ", en: "From 35 JOD" } },
      { name: { ar: "صبغة للشعر (الغامق)", en: "Dark hair colour" }, duration: { ar: "15 دقيقة", en: "15 min" }, price: { ar: "10 د.أ", en: "10 JOD" } },
      { name: { ar: "صبغة فاتحة / سحب لون", en: "Light colour / bleach" }, duration: { ar: "120 دقيقة", en: "120 min" }, price: { ar: "يبدأ من 50 د.أ", en: "From 50 JOD" } },
      { name: { ar: "حنة للشعر أو اللحية", en: "Hair or beard henna" }, duration: { ar: "10 دقائق", en: "10 min" }, price: { ar: "8 د.أ", en: "8 JOD" } },
    ],
  },
  {
    id: "nails",
    title: { ar: "العناية بالأظافر", en: "Nail Care" },
    strap: { ar: "لليدين، للقدمين، أو كلاهما", en: "Hands, feet, or both" },
    items: [
      { name: { ar: "عناية اليدين", en: "Hand care" }, duration: { ar: "20 دقيقة", en: "20 min" }, price: { ar: "10 د.أ", en: "10 JOD" } },
      { name: { ar: "عناية القدمين", en: "Foot care" }, duration: { ar: "25 دقيقة", en: "25 min" }, price: { ar: "15 د.أ", en: "15 JOD" } },
      { name: { ar: "عناية اليدين والقدمين", en: "Hand & foot care" }, duration: { ar: "45 دقيقة", en: "45 min" }, price: { ar: "25 د.أ", en: "25 JOD" } },
    ],
  },
  {
    id: "skin",
    title: { ar: "العناية بالبشرة", en: "Skin Care" },
    strap: { ar: "لمسة نظيفة ومظهر متوازن", en: "Clean finish, balanced look" },
    items: [
      { name: { ar: "واكس للوجه كامل", en: "Full-face wax" }, duration: { ar: "15 دقيقة", en: "15 min" }, price: { ar: "10 د.أ", en: "10 JOD" } },
      { name: { ar: "ادفانس", en: "Advance" }, duration: { ar: "45 دقيقة", en: "45 min" }, price: { ar: "50 د.أ", en: "50 JOD" }, note: { ar: "هيدرافيشل، قناع، سنفرة، مقشرات، مرطبات وبخار", en: "Hydrafacial, mask, scrub, exfoliation, moisturisers and steam" } },
      { name: { ar: "اكسبريس", en: "Express" }, duration: { ar: "25 دقيقة", en: "25 min" }, price: { ar: "20 د.أ", en: "20 JOD" }, note: { ar: "قناع وبخار", en: "Mask and steam" } },
      { name: { ar: "ادفانس 2", en: "Advance 2" }, duration: { ar: "35 دقيقة", en: "35 min" }, price: { ar: "35 د.أ", en: "35 JOD" }, note: { ar: "قناع، سنفرة، مقشرات، مرطبات، كريمات وبخار", en: "Mask, scrub, exfoliation, moisturisers, creams and steam" } },
    ],
  },
  {
    id: "packages",
    title: { ar: "البكجات", en: "Packages" },
    strap: { ar: "تجارب عناية متكاملة", en: "Complete care rituals" },
    items: [
      { name: { ar: "بكج MJ", en: "MJ Package" }, duration: { ar: "45 دقيقة", en: "45 min" }, price: { ar: "25 د.أ", en: "25 JOD" }, note: { ar: "حلاقة شعر ولحية + إكسبريس فيشل", en: "Haircut and beard + express facial" } },
      { name: { ar: "MJ 2", en: "MJ 2" }, duration: { ar: "60 دقيقة", en: "60 min" }, price: { ar: "35 د.أ", en: "35 JOD" }, note: { ar: "بدكير يد وقدم + شعر ولحية + سشوار", en: "Hand and foot care + haircut and beard + blow dry" } },
      { name: { ar: "MJ SUPER", en: "MJ SUPER" }, duration: { ar: "", en: "" }, price: { ar: "80 د.أ", en: "80 JOD" }, note: { ar: "شعر + لحية + سشوار + بدكير يد وقدم + هيدرافيشل", en: "Hair + beard + blow dry + hand and foot care + hydrafacial" } },
      { name: { ar: "بكج الإكسبريس", en: "Express Package" }, duration: { ar: "", en: "" }, price: { ar: "50 د.أ", en: "50 JOD" }, note: { ar: "بدكير يد وقدم + شعر ولحية + سشوار + إكسبريس فيشل", en: "Hand and foot care + haircut and beard + blow dry + express facial" } },
      { name: { ar: "بكج العريس", en: "Groom Package" }, duration: { ar: "", en: "" }, price: { ar: "100 د.أ", en: "100 JOD" }, note: { ar: "30 دقيقة مساج + بدكير يد وأقدام + شعر ولحية + أدفانس سوبر للبشرة", en: "30-minute massage + hand and foot care + haircut and beard + Advanced Super facial" } },
    ],
  },
];

const team = [
  { name: "BAHAA", role: { ar: "مصفف شعر", en: "Hair Stylist" }, image: "/assets/team-bahaa.jpg" },
  { name: "OSAID", role: { ar: "مصفف شعر", en: "Hair Stylist" }, image: "/assets/team-osaid.jpg" },
  { name: "AMRO", role: { ar: "مصفف شعر", en: "Hair Stylist" }, image: "/assets/team-amro.jpg" },
  { name: "ALI", role: { ar: "مصفف شعر", en: "Hair Stylist" }, image: "/assets/team-ali.jpg" },
  { name: "MUSTAFA", role: { ar: "مصفف شعر والمؤسس", en: "Hair Stylist · Founder" }, image: "/assets/team-mustafa.jpg", founder: true },
  { name: "M7M7", role: { ar: "مصفف شعر", en: "Hair Stylist" }, image: "/assets/team-m7m7.jpg" },
  { name: "MERA", role: { ar: "أخصائية أظافر", en: "Nail Specialist" } },
  { name: "AOWS", role: { ar: "مصفف شعر", en: "Hair Stylist" } },
];

const ui = {
  ar: {
    nav: ["الخدمات", "الفريق", "داخل MJ", "تواصل"],
    heroEyebrow: "صالون MJ · عمّان",
    heroLine: "تفاصيل تصنع حضورك.",
    scroll: "اسحب للأسفل — التجربة تبدأ هنا",
    playHero: "تشغيل المشهد",
    cutKicker: "الحرفة تبدأ من القطع الأول",
    cutTop: "نقصّ",
    cutBottom: "المألوف.",
    cutBody: "دقة في الحركة. هدوء في التجربة. نتيجة تشبهك أنت.",
    servicesKicker: "اختر تجربتك",
    servicesTitle: "خدمات مصممة حولك.",
    servicesBody: "اضغط على أي فئة لتظهر التفاصيل، المدة والسعر بوضوح.",
    open: "عرض التفاصيل",
    close: "إغلاق التفاصيل",
    duration: "المدة",
    teamKicker: "الفريق",
    teamTitle: "الأشخاص خلف كل تفصيلة.",
    teamBody: "خبرة فردية، بروح فريق واحدة.",
    insideKicker: "داخل MJ",
    insideTitle: "مكان صُمّم للحضور.",
    insideBody: "من الواجهة إلى آخر محطة عناية، كل زاوية في MJ جزء من التجربة.",
    cinemaCraft: "الحرفة",
    cinemaSpace: "المكان",
    cinemaTeam: "الفريق",
    visitKicker: "تعال كما أنت",
    visitTitle: "ونحن نهتم بالباقي.",
    openDaily: "نفتح يوميًا",
    hours: "12:00 ظهرًا — 11:00 مساءً",
    location: "افتح الموقع على الخريطة",
    whatsapp: "واتساب",
    instagram: "إنستغرام",
    contact: "تواصل معنا",
    footer: "MJ HAIR SALON · BY MUSTAFA ALKHATEEB",
    bookingNav: "احجز الآن",
    bookingItem: "حجز",
  },
  en: {
    nav: ["Services", "Team", "Inside MJ", "Contact"],
    heroEyebrow: "MJ Hair Salon · Amman",
    heroLine: "Details shape your presence.",
    scroll: "Scroll down — the experience starts here",
    playHero: "Play the film",
    cutKicker: "The craft begins with the first cut",
    cutTop: "CUT THE",
    cutBottom: "ORDINARY.",
    cutBody: "Precision in every movement. Calm in every moment. A result that feels like you.",
    servicesKicker: "Choose your experience",
    servicesTitle: "Care, shaped around you.",
    servicesBody: "Select a category to reveal its services, timing and price.",
    open: "View details",
    close: "Close details",
    duration: "Duration",
    teamKicker: "The team",
    teamTitle: "The people behind every detail.",
    teamBody: "Individual craft. One shared standard.",
    insideKicker: "Inside MJ",
    insideTitle: "A space made for presence.",
    insideBody: "From the entrance to the final care station, every corner is part of the MJ experience.",
    cinemaCraft: "The craft",
    cinemaSpace: "The space",
    cinemaTeam: "The team",
    visitKicker: "Come as you are",
    visitTitle: "We’ll take care of the rest.",
    openDaily: "Open daily",
    hours: "12:00 PM — 11:00 PM",
    location: "Open location in Maps",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    contact: "Contact us",
    footer: "MJ HAIR SALON · BY MUSTAFA ALKHATEEB",
    bookingNav: "Book now",
    bookingItem: "Book",
  },
};

function LuxuryBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;
    let setupObserver: IntersectionObserver | null = null;
    let started = false;
    const initialize = () => {
      if (started || cancelled) return;
      started = true;
      setupObserver?.disconnect();
      void import("three").then((THREE) => {
        if (cancelled) return;

    const mobile = window.innerWidth < 720;
    let renderer: WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !mobile, powerPreference: "high-performance" });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.1 : 1.45));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x07131c, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07131c, 0.055);
    const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 60);
    camera.position.set(0, 0, 10);

    const field = new THREE.Group();
    field.rotation.x = -0.08;
    scene.add(field);

    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const strands: Mesh[] = [];
    const strandCount = mobile ? 6 : 11;

    for (let strand = 0; strand < strandCount; strand += 1) {
      const points: Vector3[] = [];
      for (let point = 0; point < 8; point += 1) {
        const x = -6.8 + point * 1.95;
        const y = Math.sin(point * 0.82 + strand * 0.67) * (0.52 + strand * 0.035) + (strand - strandCount / 2) * 0.16;
        const z = -2.8 + strand * 0.45 + Math.cos(point * 0.7 + strand) * 0.35;
        points.push(new THREE.Vector3(x, y, z));
      }
      const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.42);
      const geometry = new THREE.TubeGeometry(curve, mobile ? 42 : 72, 0.018 + (strand % 3) * 0.007, mobile ? 5 : 8, false);
      const material = new THREE.MeshPhysicalMaterial({
        color: strand % 4 === 0 ? 0xc62027 : strand % 3 === 0 ? 0xe9eef1 : 0x193447,
        metalness: 0.88,
        roughness: strand % 3 === 0 ? 0.18 : 0.3,
        clearcoat: 0.72,
        transparent: true,
        opacity: strand % 4 === 0 ? 0.72 : 0.34,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.offset = strand * 0.58;
      field.add(mesh);
      strands.push(mesh);
      geometries.push(geometry);
      materials.push(material);
    }

    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
      const geometry = new THREE.TorusGeometry(1.45 + ringIndex * 1.38, 0.014 + ringIndex * 0.003, 6, mobile ? 72 : 132);
      const material = new THREE.MeshBasicMaterial({
        color: ringIndex === 1 ? 0xc62027 : 0xffffff,
        transparent: true,
        opacity: ringIndex === 1 ? 0.28 : 0.12,
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.position.set(ringIndex % 2 ? 2.7 : -2.4, ringIndex - 1.1, -1.5 - ringIndex * 0.45);
      ring.rotation.x = 0.56 + ringIndex * 0.2;
      ring.rotation.y = -0.3 + ringIndex * 0.28;
      field.add(ring);
      geometries.push(geometry);
      materials.push(material);
    }

    const particleCount = mobile ? 46 : 96;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      particlePositions[index * 3] = (Math.random() - 0.5) * 15;
      particlePositions[index * 3 + 1] = (Math.random() - 0.5) * 8;
      particlePositions[index * 3 + 2] = (Math.random() - 0.5) * 7;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: mobile ? 0.026 : 0.034,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    field.add(particles);
    geometries.push(particleGeometry);
    materials.push(particleMaterial);

    scene.add(new THREE.HemisphereLight(0xdff4ff, 0x061018, 2.4));
    const redLight = new THREE.PointLight(0xc62027, 28, 18);
    redLight.position.set(-4, 2.5, 4);
    scene.add(redLight);
    const whiteLight = new THREE.PointLight(0xe8f3ff, 16, 16);
    whiteLight.position.set(4, -2, 3);
    scene.add(whiteLight);

    let pointerX = 0;
    let pointerY = 0;
    let scrollRatio = 0;
    let frame = 0;
    let resizeFrame = 0;
    let active = false;
    let pageVisible = !document.hidden;
    let lastFrameTime = 0;
    const visibleSections = new Set<Element>();

    const stopFrame = () => {
      if (!frame) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastFrameTime = 0;
    };

    const requestFrame = () => {
      if (!frame && active && pageVisible) frame = window.requestAnimationFrame(animate);
    };

    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleSections.add(entry.target);
        else visibleSections.delete(entry.target);
      });
      active = visibleSections.size > 0;
      renderer.domElement.style.opacity = active ? "1" : "0";
      if (active) {
        onScroll();
        requestFrame();
      } else {
        stopFrame();
      }
    }, { rootMargin: "12% 0px" });
    document.querySelectorAll(".dark-3d").forEach((section) => sectionObserver.observe(section));

    const onPointer = (event: PointerEvent) => {
      if (!active) return;
      pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    const onScroll = () => {
      scrollRatio = window.scrollY / Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    };
    const onResize = () => {
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 720 ? 1.1 : 1.45));
      });
    };
    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) requestFrame();
      else stopFrame();
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    onScroll();

    function animate(time: number) {
      frame = 0;
      if (!active || !pageVisible) return;
      const frameScale = lastFrameTime ? Math.min((time - lastFrameTime) / (1000 / 60), 3) : 1;
      lastFrameTime = time;
      const smooth = 1 - Math.pow(1 - 0.025, frameScale);
      const seconds = time * 0.001;
      strands.forEach((strand) => {
        strand.rotation.z = Math.sin(seconds * 0.19 + strand.userData.offset) * 0.035;
        strand.position.y = Math.sin(seconds * 0.27 + strand.userData.offset) * 0.09;
      });
      particles.rotation.z = seconds * 0.012;
      field.rotation.y += ((pointerX * 0.055 + scrollRatio * 0.12) - field.rotation.y) * smooth;
      field.rotation.x += ((-0.08 - pointerY * 0.035) - field.rotation.x) * smooth;
      field.position.y = Math.sin(seconds * 0.18) * 0.1;
      camera.position.x += (pointerX * 0.18 - camera.position.x) * smooth;
      camera.position.y += (-pointerY * 0.1 - camera.position.y) * smooth;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      requestFrame();
    }

    cleanup = () => {
      stopFrame();
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sectionObserver.disconnect();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
      });
    };

    const firstAmbientSection = document.querySelector(".dark-3d");
    if (firstAmbientSection) {
      setupObserver = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) initialize();
      }, { rootMargin: "100% 0px" });
      setupObserver.observe(firstAmbientSection);
    } else {
      initialize();
    }

    return () => {
      cancelled = true;
      setupObserver?.disconnect();
      cleanup?.();
    };
  }, []);

  return <div className="ambient-canvas" ref={mountRef} aria-hidden="true" />;
}

function ScissorScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;
    let setupObserver: IntersectionObserver | null = null;
    let started = false;
    const initialize = () => {
      if (started || cancelled) return;
      started = true;
      setupObserver?.disconnect();
      void import("three").then((THREE) => {
        if (cancelled) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch {
      return;
    }

    const qualityRatio = () => Math.min(window.devicePixelRatio, window.innerWidth < 720 ? 1.4 : 1.75);
    renderer.setPixelRatio(qualityRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 8.7);

    const root = new THREE.Group();
    root.rotation.z = -Math.PI / 2;
    root.position.y = window.innerWidth < 720 ? 4.75 : 5.18;
    root.scale.setScalar(window.innerWidth < 720 ? 0.48 : 0.59);
    scene.add(root);

    const environmentCanvas = document.createElement("canvas");
    environmentCanvas.width = 1024;
    environmentCanvas.height = 512;
    const environmentContext = environmentCanvas.getContext("2d");
    if (environmentContext) {
      const gradient = environmentContext.createLinearGradient(0, 0, 1024, 512);
      gradient.addColorStop(0, "#08131b");
      gradient.addColorStop(0.28, "#f8fbff");
      gradient.addColorStop(0.42, "#344c5f");
      gradient.addColorStop(0.7, "#ffffff");
      gradient.addColorStop(0.84, "#c62027");
      gradient.addColorStop(1, "#09141d");
      environmentContext.fillStyle = gradient;
      environmentContext.fillRect(0, 0, 1024, 512);
    }
    const environmentTexture = new THREE.CanvasTexture(environmentCanvas);
    environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
    environmentTexture.colorSpace = THREE.SRGBColorSpace;
    scene.environment = environmentTexture;

    const steel = new THREE.MeshPhysicalMaterial({
      color: 0xe9eef1,
      metalness: 1,
      roughness: 0.1,
      clearcoat: 0.96,
      clearcoatRoughness: 0.07,
      reflectivity: 1,
      side: THREE.DoubleSide,
    });
    const bladeEdge = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.035, clearcoat: 1, clearcoatRoughness: 0.025 });
    const gunmetal = new THREE.MeshPhysicalMaterial({ color: 0x0a1822, metalness: 0.9, roughness: 0.18, clearcoat: 0.82 });
    const red = new THREE.MeshPhysicalMaterial({ color: 0xc62027, metalness: 0.76, roughness: 0.16, clearcoat: 0.9, clearcoatRoughness: 0.1 });

    const engravingCanvas = document.createElement("canvas");
    engravingCanvas.width = 768;
    engravingCanvas.height = 128;
    const engravingContext = engravingCanvas.getContext("2d");
    if (engravingContext) {
      engravingContext.clearRect(0, 0, 768, 128);
      engravingContext.fillStyle = "rgba(7,19,28,.78)";
      engravingContext.font = "700 48px Arial";
      engravingContext.textAlign = "center";
      engravingContext.textBaseline = "middle";
      engravingContext.fillText("MJ  /  PRECISION SERIES", 384, 64);
      engravingContext.fillStyle = "#c62027";
      engravingContext.fillRect(128, 104, 512, 4);
    }
    const engravingTexture = new THREE.CanvasTexture(engravingCanvas);
    engravingTexture.colorSpace = THREE.SRGBColorSpace;
    const engravingGeometry = new THREE.PlaneGeometry(1.72, 0.286);
    const engravingMaterial = new THREE.MeshBasicMaterial({ map: engravingTexture, transparent: true, depthWrite: false, opacity: 0.82 });

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.08, -0.11);
    bladeShape.bezierCurveTo(0.78, -0.08, 2.65, -0.02, 3.58, 0.03);
    bladeShape.quadraticCurveTo(3.9, 0.08, 4.12, 0.2);
    bladeShape.quadraticCurveTo(3.86, 0.31, 3.45, 0.36);
    bladeShape.bezierCurveTo(2.48, 0.43, 0.78, 0.4, 0.32, 0.28);
    bladeShape.quadraticCurveTo(0.04, 0.2, -0.08, -0.11);
    const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.13,
      bevelEnabled: true,
      bevelSize: 0.045,
      bevelThickness: 0.042,
      bevelSegments: 4,
    });

    const edgeShape = new THREE.Shape();
    edgeShape.moveTo(0.12, -0.105);
    edgeShape.bezierCurveTo(1.25, -0.075, 2.95, -0.025, 3.86, 0.055);
    edgeShape.lineTo(3.62, 0.105);
    edgeShape.bezierCurveTo(2.55, 0.035, 1.08, 0.01, 0.14, 0.005);
    edgeShape.closePath();
    const edgeGeometry = new THREE.ExtrudeGeometry(edgeShape, {
      depth: 0.145,
      bevelEnabled: true,
      bevelSize: 0.016,
      bevelThickness: 0.015,
      bevelSegments: 2,
    });

    function createHalf(mirror: boolean) {
      const half = new THREE.Group();
      const blade = new THREE.Mesh(bladeGeometry, steel);
      blade.castShadow = true;
      half.add(blade);

      const cuttingEdge = new THREE.Mesh(edgeGeometry, bladeEdge);
      cuttingEdge.position.z = 0.005;
      half.add(cuttingEdge);

      if (!mirror) {
        const engraving = new THREE.Mesh(engravingGeometry, engravingMaterial);
        engraving.position.set(1.68, 0.235, 0.188);
        half.add(engraving);
      }

      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.78, 8, 20), mirror ? red : gunmetal);
      arm.position.set(-0.47, 0.07, 0.05);
      arm.rotation.z = Math.PI / 2 - 0.08;
      half.add(arm);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.15, 22, 96), mirror ? red : gunmetal);
      ring.position.set(-1.22, 0.08, 0.035);
      ring.scale.y = 1.28;
      ring.castShadow = true;
      half.add(ring);

      const ringAccent = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.024, 12, 80), bladeEdge);
      ringAccent.position.set(-1.22, 0.08, 0.18);
      ringAccent.scale.y = 1.28;
      half.add(ringAccent);

      if (mirror) half.scale.y = -1;
      return half;
    }

    const top = createHalf(false);
    const bottom = createHalf(true);
    top.rotation.z = 0.34;
    bottom.rotation.z = -0.34;
    root.add(top, bottom);

    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.32, 64), red);
    pivot.rotation.x = Math.PI / 2;
    pivot.position.z = 0.2;
    root.add(pivot);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.38, 48), steel);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.23;
    root.add(cap);

    const badgeCanvas = document.createElement("canvas");
    badgeCanvas.width = 256;
    badgeCanvas.height = 256;
    const badgeContext = badgeCanvas.getContext("2d");
    if (badgeContext) {
      badgeContext.clearRect(0, 0, 256, 256);
      badgeContext.fillStyle = "#c62027";
      badgeContext.beginPath();
      badgeContext.arc(128, 128, 112, 0, Math.PI * 2);
      badgeContext.fill();
      badgeContext.strokeStyle = "rgba(255,255,255,.75)";
      badgeContext.lineWidth = 5;
      badgeContext.stroke();
      badgeContext.fillStyle = "#ffffff";
      badgeContext.font = "700 72px Arial";
      badgeContext.textAlign = "center";
      badgeContext.textBaseline = "middle";
      badgeContext.fillText("MJ", 128, 132);
    }
    const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
    badgeTexture.colorSpace = THREE.SRGBColorSpace;
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.245, 64), new THREE.MeshBasicMaterial({ map: badgeTexture, transparent: true }));
    badge.position.z = 0.44;
    root.add(badge);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.014, 8, 160), new THREE.MeshBasicMaterial({ color: 0xc62027, transparent: true, opacity: 0.32 }));
    halo.position.z = -1.1;
    root.add(halo);

    scene.add(new THREE.HemisphereLight(0xf7fbff, 0x07131c, 2.8));
    const key = new THREE.DirectionalLight(0xffffff, 6.4);
    key.position.set(4.5, 4, 6);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.PointLight(0xc62027, 38, 20);
    rim.position.set(-4, -2, 3);
    scene.add(rim);
    const coolFill = new THREE.PointLight(0x8ad4ff, 16, 18);
    coolFill.position.set(3, -3, 4);
    scene.add(coolFill);

    let cutProgress = 0;
    let cutApproach = 0;
    let pointerX = 0;
    let pointerY = 0;
    let frame = 0;
    let resizeFrame = 0;
    let active = false;
    let pageVisible = !document.hidden;
    let lastFrameTime = 0;
    const cutSection = document.getElementById("cut");

    const stopFrame = () => {
      if (!frame) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastFrameTime = 0;
    };

    const requestFrame = () => {
      if (!frame && active && pageVisible) frame = window.requestAnimationFrame(animate);
    };

    const onPointer = (event: PointerEvent) => {
      if (!active) return;
      pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    const onScroll = () => {
      if (!active || !cutSection) return;
      const rect = cutSection.getBoundingClientRect();
      const travelDistance = Math.max(rect.height - window.innerHeight, 1);
      cutProgress = Math.min(1, Math.max(0, -rect.top / travelDistance));
      cutApproach = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / (window.innerHeight * 0.82)));
    };
    const onResize = () => {
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(qualityRatio());
      });
    };
    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) requestFrame();
      else stopFrame();
    };

    const sectionObserver = new IntersectionObserver(([entry]) => {
      active = Boolean(entry?.isIntersecting);
      if (active) {
        onScroll();
        requestFrame();
      } else {
        stopFrame();
        renderer.clear();
        renderer.domElement.style.opacity = "0";
      }
    }, { rootMargin: "45% 0px" });
    if (cutSection) sectionObserver.observe(cutSection);

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);

    function animate(time: number) {
      frame = 0;
      if (!active || !pageVisible) return;
      const frameScale = lastFrameTime ? Math.min((time - lastFrameTime) / (1000 / 60), 3) : 1;
      lastFrameTime = time;
      const damp = (amount: number) => 1 - Math.pow(1 - amount, frameScale);
      const travel = THREE.MathUtils.smoothstep(cutProgress, 0.055, 0.86);
      const cuttingWindow = THREE.MathUtils.smoothstep(cutProgress, 0.035, 0.12) * (1 - THREE.MathUtils.smoothstep(cutProgress, 0.86, 0.96));
      const snip = (Math.sin(travel * Math.PI * 9) + 1) * 0.5;
      const bladeGap = 0.37 - cuttingWindow * (0.19 + snip * 0.15);
      const departure = THREE.MathUtils.smoothstep(cutProgress, 0.9, 1);
      const mobile = window.innerWidth < 720;
      const pathStart = mobile ? 4.75 : 5.18;
      const pathEnd = mobile ? -0.8 : -0.42;

      top.rotation.z += (bladeGap - top.rotation.z) * damp(0.13);
      bottom.rotation.z += (-bladeGap - bottom.rotation.z) * damp(0.13);
      root.rotation.x += ((pointerY * 0.055) - root.rotation.x) * damp(0.045);
      root.rotation.y += ((pointerX * 0.075) - root.rotation.y) * damp(0.045);
      root.rotation.z += ((-Math.PI / 2 + pointerX * 0.018 + Math.sin(travel * Math.PI) * 0.025) - root.rotation.z) * damp(0.075);
      root.position.x += ((pointerX * (mobile ? 0.055 : 0.12)) - root.position.x) * damp(0.07);
      root.position.y += (THREE.MathUtils.lerp(pathStart, pathEnd, travel) - root.position.y) * damp(0.09);
      root.position.z += ((Math.sin(travel * Math.PI) * 0.18) - root.position.z) * damp(0.06);
      const targetScale = mobile ? 0.48 : 0.59;
      root.scale.setScalar(targetScale);
      halo.rotation.z += 0.0035 * frameScale;
      halo.scale.setScalar(0.82 + travel * 0.14);
      const opacity = Math.max(0, cutApproach * (1 - departure));
      renderer.domElement.style.opacity = String(opacity);

      camera.position.x += (pointerX * 0.12 - camera.position.x) * damp(0.035);
      camera.position.y += (-pointerY * 0.08 - camera.position.y) * damp(0.035);
      camera.lookAt(0, 0, 0);
      if (opacity > 0.003) renderer.render(scene, camera);
      else renderer.clear();
      requestFrame();
    }

    cleanup = () => {
      stopFrame();
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sectionObserver.disconnect();
      bladeGeometry.dispose();
      edgeGeometry.dispose();
      engravingGeometry.dispose();
      environmentTexture.dispose();
      badgeTexture.dispose();
      engravingTexture.dispose();
      engravingMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
      });
    };

    const cutSection = document.getElementById("cut");
    if (cutSection) {
      setupObserver = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) initialize();
      }, { rootMargin: "0px 0px -25% 0px" });
      setupObserver.observe(cutSection);
    } else {
      initialize();
    }

    return () => {
      cancelled = true;
      setupObserver?.disconnect();
      cleanup?.();
    };
  }, []);

  return <div className="scissor-canvas" ref={mountRef} aria-hidden="true" />;
}

export default function Home() {
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const [lang, setLang] = useState<Lang>("ar");
  const [activeService, setActiveService] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroNeedsPlay, setHeroNeedsPlay] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingServiceId, setBookingServiceId] = useState<string | null>(null);
  const t = ui[lang];
  const Arrow = lang === "ar" ? ArrowUpLeft : ArrowUpRight;

  const launchBooking = (serviceId?: string) => {
    setBookingServiceId(serviceId ?? null);
    setBookingOpen(true);
    setMenuOpen(false);
  };

  const playActiveHero = () => {
    if (typeof window === "undefined") return;
    const video = heroVideoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    void video.play().then(() => setHeroNeedsPlay(false)).catch(() => setHeroNeedsPlay(true));
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  useEffect(() => {
    const desktopMotion = window.matchMedia("(min-width: 769px) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    if (!desktopMotion.matches) return;
    const lenis = new Lenis({
      duration: 1.08,
      smoothWheel: true,
      wheelMultiplier: 0.92,
      touchMultiplier: 1,
    });
    let animationFrame = 0;
    const animateScroll = (time: number) => {
      lenis.raf(time);
      animationFrame = window.requestAnimationFrame(animateScroll);
    };
    animationFrame = window.requestAnimationFrame(animateScroll);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    const cut = document.querySelector<HTMLElement>(".cut-scene");
    let scrollFrame = 0;
    const update = () => {
      scrollFrame = 0;
      const heroProgress = Math.min(1, window.scrollY / Math.max(window.innerHeight, 1));
      const siteProgress = window.scrollY / Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      let cutProgress = 0;
      if (cut) {
        const rect = cut.getBoundingClientRect();
        cutProgress = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height - window.innerHeight, 1)));
      }
      document.documentElement.style.setProperty("--hero-progress", heroProgress.toFixed(3));
      document.documentElement.style.setProperty("--cut-progress", cutProgress.toFixed(3));
      document.documentElement.style.setProperty("--site-progress", siteProgress.toFixed(4));
      const peelProgress = Math.min(1, Math.max(0, (cutProgress - 0.68) / 0.32));
      document.documentElement.style.setProperty("--cut-left-shift", `${(-peelProgress * 118).toFixed(2)}%`);
      document.documentElement.style.setProperty("--cut-right-shift", `${(peelProgress * 118).toFixed(2)}%`);
      document.documentElement.style.setProperty("--cut-peel", peelProgress.toFixed(3));
      document.documentElement.style.setProperty("--cut-line", `${Math.min(100, cutProgress * 116).toFixed(2)}%`);
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const revealInView = () => {
      const viewport = window.innerHeight || document.documentElement.clientHeight;
      elements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top < viewport * 0.94 && rect.bottom > viewport * 0.04) element.classList.add("is-visible");
      });
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });
    elements.forEach((element) => observer.observe(element));
    let fallbackFrame = window.requestAnimationFrame(revealInView);
    const checkOnce = () => {
      window.cancelAnimationFrame(fallbackFrame);
      fallbackFrame = window.requestAnimationFrame(revealInView);
    };
    window.addEventListener("hashchange", revealInView);
    window.addEventListener("pageshow", checkOnce);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(fallbackFrame);
      window.removeEventListener("hashchange", revealInView);
      window.removeEventListener("pageshow", checkOnce);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const video = heroVideoRef.current;
    if (!video) return;
    let disposed = false;
    let heroVisible = true;

    const attemptPlayback = () => {
      const source = media.matches ? "/assets/mj-salon-hero-mobile-1080.mp4" : "/assets/mj-salon-hero-1080.mp4";
      const poster = media.matches ? "/assets/mj-salon-hero-mobile-poster.jpg" : "/assets/mj-salon-hero-poster.jpg";
      if (!video.currentSrc.endsWith(source) && video.getAttribute("src") !== source) {
        video.src = source;
        video.poster = poster;
        video.load();
      }
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      if (!heroVisible || document.hidden || bookingOpen) {
        video.pause();
        return;
      }
      if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) video.load();
      void video.play()
        .then(() => !disposed && setHeroNeedsPlay(false))
        .catch(() => !disposed && setHeroNeedsPlay(true));
    };

    const resumeOnVisible = () => {
      if (!document.hidden && heroVisible) attemptPlayback();
      else video.pause();
    };
    const unlockPlayback = () => attemptPlayback();
    const retryTimer = window.setTimeout(attemptPlayback, 180);
    const heroObserver = new IntersectionObserver(([entry]) => {
      heroVisible = Boolean(entry?.isIntersecting);
      if (heroVisible) attemptPlayback();
      else video.pause();
    }, { threshold: 0.04, rootMargin: "10% 0px" });
    const hero = video.closest(".hero");
    if (hero) heroObserver.observe(hero);

    video.addEventListener("canplay", attemptPlayback);
    media.addEventListener("change", attemptPlayback);
    document.addEventListener("visibilitychange", resumeOnVisible);
    window.addEventListener("pageshow", attemptPlayback);
    window.addEventListener("touchstart", unlockPlayback, { passive: true, once: true });
    window.addEventListener("pointerdown", unlockPlayback, { passive: true, once: true });
    window.addEventListener("scroll", unlockPlayback, { passive: true, once: true });
    attemptPlayback();

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      heroObserver.disconnect();
      video.removeEventListener("canplay", attemptPlayback);
      media.removeEventListener("change", attemptPlayback);
      document.removeEventListener("visibilitychange", resumeOnVisible);
      window.removeEventListener("pageshow", attemptPlayback);
      window.removeEventListener("touchstart", unlockPlayback);
      window.removeEventListener("pointerdown", unlockPlayback);
      window.removeEventListener("scroll", unlockPlayback);
    };
  }, [bookingOpen]);

  useEffect(() => {
    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>(".cinema-video"));
    const visibleVideos = new Set<HTMLVideoElement>();
    const setPlayback = (video: HTMLVideoElement, playing: boolean) => {
      if (!playing || document.hidden) {
        video.pause();
        return;
      }
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      void video.play().catch(() => undefined);
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) {
          visibleVideos.add(video);
          setPlayback(video, true);
        } else {
          visibleVideos.delete(video);
          setPlayback(video, false);
        }
      });
      document.querySelector(".finale-stage")?.classList.toggle("is-playing", visibleVideos.size > 0);
    }, { threshold: 0.16, rootMargin: "12% 0px" });
    videos.forEach((video) => observer.observe(video));
    const syncVisiblePlayback = () => {
      visibleVideos.forEach((video) => setPlayback(video, !document.hidden));
      if (document.hidden) videos.forEach((video) => video.pause());
    };
    document.addEventListener("visibilitychange", syncVisiblePlayback);
    window.addEventListener("pageshow", syncVisiblePlayback);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisiblePlayback);
      window.removeEventListener("pageshow", syncVisiblePlayback);
      document.querySelector(".finale-stage")?.classList.remove("is-playing");
    };
  }, []);

  const navTargets = ["services", "team", "inside", "contact"];

  return (
    <main className={`site-shell lang-${lang}`} dir={lang === "ar" ? "rtl" : "ltr"}>
      <LuxuryBackground />
      <ScissorScene />
      <div className="site-scroll-progress" aria-hidden="true"><i /></div>

      <header className="topbar">
        <a href="#home" className="brand-chip" aria-label="MJ Hair Salon">
          <img src="/assets/mj-logo.svg" alt="MJ Hair Salon" />
        </a>

        <nav className={`nav-links ${menuOpen ? "is-open" : ""}`} aria-label={lang === "ar" ? "التنقل الرئيسي" : "Main navigation"}>
          {t.nav.map((label, index) => (
            <a key={label} href={`#${navTargets[index]}`} onClick={() => setMenuOpen(false)}>
              {label}
            </a>
          ))}
        </nav>

        <div className="top-actions">
          <BookingButton lang={lang} onClick={() => launchBooking()} compact />
          <button className="language-toggle" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}>
            <span className={lang === "ar" ? "active" : ""}>AR</span>
            <i />
            <span className={lang === "en" ? "active" : ""}>EN</span>
          </button>
          <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={menuOpen ? "Close menu" : "Open menu"}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <aside className="social-dock" aria-label={lang === "ar" ? "روابط التواصل" : "Social links"}>
        <a href={contact.whatsapp} target="_blank" rel="noreferrer" aria-label="WhatsApp"><FaWhatsapp size={20} /><span>{t.whatsapp}</span></a>
        <a href={contact.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><FaInstagram size={20} /><span>{t.instagram}</span></a>
      </aside>

      {bookingOpen && <BookingExperience key={bookingServiceId ?? "booking"} lang={lang} initialServiceId={bookingServiceId} open onClose={() => setBookingOpen(false)} />}

      <section className="hero" id="home">
        <div className="hero-media" aria-hidden="true">
          <video ref={heroVideoRef} className="hero-video" autoPlay muted loop playsInline preload="metadata" poster="/assets/mj-salon-hero-poster.jpg" disablePictureInPicture />
        </div>
        <div className="hero-video-shade" />
        <div className="portal portal-a" />
        <div className="portal portal-b" />
        <div className="hero-grain" />
        <div className="hero-center">
          <p className="hero-eyebrow">{t.heroEyebrow}</p>
          <div className="hero-logo-frame">
            <img src="/assets/mj-logo.svg" alt="MJ Hair Salon by Mustafa Alkhateeb" />
          </div>
          <p className="hero-line">{t.heroLine}</p>
          <BookingButton lang={lang} onClick={() => launchBooking()} />
        </div>
        {heroNeedsPlay && (
          <button className="hero-play-fallback" type="button" onClick={playActiveHero}>
            <Play size={16} fill="currentColor" />
            <span>{t.playHero}</span>
          </button>
        )}
        <a className="scroll-cue" href="#cut">
          <strong>{t.scroll}</strong>
          <span className="scroll-cue-wheel"><i /><ArrowDown size={22} /></span>
        </a>
      </section>

      <section className="cut-scene" id="cut">
        <div className="cut-sticky">
          <div className="cut-rear" aria-hidden="true">
            <div className="cut-rear-grid" />
            <div className="cut-rear-copy"><span>MJ SERVICES</span><strong>{t.servicesTitle}</strong><small>{t.servicesKicker}</small></div>
          </div>
          <div className="cut-panel cut-panel-left" />
          <div className="cut-panel cut-panel-right" />
          <div className="cut-copy">
            <p>{t.cutKicker}</p>
            <h1><span>{t.cutTop}</span><strong>{t.cutBottom}</strong></h1>
            <div className="cut-body"><Scissors size={20} /><span>{t.cutBody}</span></div>
          </div>
          <div className="cut-seam" aria-hidden="true"><i /></div>
          <div className="cut-track"><i /></div>
        </div>
      </section>

      <section className="services-section" id="services">
        <div className="section-heading reveal">
          <div>
            <p className="kicker">{t.servicesKicker}</p>
            <h2>{t.servicesTitle}</h2>
          </div>
          <p className="section-intro">{t.servicesBody}</p>
        </div>

        <div className="service-layout">
          <div className="service-list reveal">
            {services.map((group, index) => {
              const active = activeService === index;
              return (
                <button key={group.id} className={`service-row ${active ? "active" : ""}`} onClick={() => setActiveService(index)} aria-expanded={active} aria-controls="service-details">
                  <span className="service-name"><strong>{group.title[lang]}</strong><small>{group.strap[lang]}</small></span>
                  <span className="service-arrow"><Arrow size={20} /></span>
                </button>
              );
            })}
          </div>

          <div className="service-detail reveal" id="service-details" aria-live="polite">
            <div className="detail-head">
              <div><p>{t.open}</p><h3>{services[activeService].title[lang]}</h3></div>
              <span className="detail-mark"><Scissors size={26} /></span>
            </div>
            <div className="detail-items">
              {services[activeService].items.map((item, index) => (
                <article key={`${item.name.en}-${index}`} className="detail-item">
                  <div className="item-copy"><h4>{item.name[lang]}</h4>{item.note && <p>{item.note[lang]}</p>}</div>
                  <div className="item-meta">{item.duration[lang] && <small>{item.duration[lang]}</small>}<strong>{item.price[lang]}</strong><button type="button" className="item-book" onClick={() => launchBooking(bookingServices.find((service) => service.name.en === item.name.en)?.id)}>{t.bookingItem}<Arrow size={13} /></button></div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="team-section dark-3d" id="team">
        <div className="section-heading light reveal">
          <div><p className="kicker">{t.teamKicker}</p><h2>{t.teamTitle}</h2></div>
          <p className="section-intro">{t.teamBody}</p>
        </div>

        <div className="team-rail reveal" role="list" aria-label={t.teamTitle}>
          {team.map((member) => (
            <article className={`team-card ${member.image ? "has-image" : "type-card"} ${member.founder ? "founder" : ""}`} key={member.name} role="listitem">
              {member.image ? <img src={member.image} alt={`${member.name} — ${member.role[lang]}`} loading="lazy" decoding="async" /> : <div className="member-monogram">{member.name.slice(0, 2)}</div>}
              <div className="team-overlay">
                <div><h3>{member.name}</h3><p>{member.role[lang]}</p></div>
                <Arrow size={18} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="inside-section" id="inside">
        <div className="inside-copy reveal">
          <p className="kicker">{t.insideKicker}</p>
          <h2>{t.insideTitle}</h2>
          <p>{t.insideBody}</p>
          <span className="inside-signature">MJ / AMMAN</span>
        </div>
        <div className="finale-stage reveal">
          <div className="finale-halo" />
          <div className="cinema-collage">
            <figure className="cinema-frame cinema-craft">
              <video className="cinema-video" src="/assets/mj-finale-craft.mp4" muted loop playsInline preload="metadata" poster="/assets/mj-finale-craft-poster.jpg" />
              <figcaption>{t.cinemaCraft}</figcaption>
            </figure>
            <figure className="cinema-frame cinema-space">
              <video className="cinema-video" src="/assets/mj-finale-space.mp4" muted loop playsInline preload="metadata" poster="/assets/mj-finale-space-poster.jpg" />
              <figcaption>{t.cinemaSpace}</figcaption>
            </figure>
            <figure className="cinema-frame cinema-team">
              <video className="cinema-video" src="/assets/mj-finale-team.mp4" muted loop playsInline preload="metadata" poster="/assets/mj-finale-team-poster.jpg" />
              <figcaption>{t.cinemaTeam}</figcaption>
            </figure>
          </div>
          <div className="finale-brand" aria-hidden="true">
            <img src="/assets/mj-logo.svg" alt="" />
            <span>THE MJ TEAM</span>
          </div>
          <div className="finale-orbit" />
        </div>
      </section>

      <section className="contact-section dark-3d" id="contact">
        <div className="contact-grid">
          <div className="contact-title reveal">
            <p className="kicker">{t.visitKicker}</p>
            <h2>{t.visitTitle}</h2>
          </div>
          <div className="contact-cards reveal">
            <article className="contact-card hours-card">
              <Clock3 size={22} />
              <div><small>{t.openDaily}</small><strong>{t.hours}</strong></div>
              <span>{lang === "ar" ? "كل يوم" : "EVERY DAY"}</span>
            </article>
            <a className="contact-card" href={contact.maps} target="_blank" rel="noreferrer">
              <MapPin size={22} /><strong>{t.location}</strong><Arrow size={20} />
            </a>
            <a className="contact-card red-card" href={contact.whatsapp} target="_blank" rel="noreferrer">
              <FaWhatsapp size={24} /><strong>+962 7 9779 9677</strong><Arrow size={20} />
            </a>
            <a className="contact-card" href={contact.instagram} target="_blank" rel="noreferrer">
              <FaInstagram size={24} /><strong>@mj.hairsalon</strong><Arrow size={20} />
            </a>
          </div>
        </div>
        <footer>
          <img src="/assets/mj-logo.svg" alt="" />
          <p>{t.footer}</p>
          <a href="#home">TOP <ArrowUpRight size={15} /></a>
        </footer>
      </section>
    </main>
  );
}
