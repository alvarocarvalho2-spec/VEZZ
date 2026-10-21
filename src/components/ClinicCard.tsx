import { ArrowUpRight, MapPin, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { Clinic } from "../types";

export default function ClinicCard({ clinic }: { clinic: Clinic }) {
  return (
    <Link
      className="v-clinic"
      to={`/clinica/${encodeURIComponent(clinic.id_clinica)}`}
    >
      <div className="v-clinic-photo">
        {clinic.foto ? (
          <img
            src={clinic.foto}
            alt=""
            loading="lazy"
            width="600"
            height="400"
          />
        ) : (
          <div className="v-clinic-placeholder">
            <Building2 size={48} />
          </div>
        )}
        <span className="v-clinic-arrow">
          <ArrowUpRight size={22} />
        </span>
      </div>
      <div className="v-clinic-info">
        <p className="v-clinic-location">
          <MapPin size={14} />
          {[clinic.endereco?.bairro, clinic.endereco?.cidade]
            .filter(Boolean)
            .join(", ") || "Veja o endereço da clínica"}
        </p>
        <h3>{clinic.nome}</h3>
        <p className="v-clinic-specialties">
          {clinic.especialidades?.slice(0, 3).join(" · ")}
        </p>
        <span className="v-clinic-cta">
          Conhecer a clínica <ArrowUpRight size={16} />
        </span>
      </div>
    </Link>
  );
}
