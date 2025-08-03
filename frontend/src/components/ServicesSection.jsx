import React from 'react';
import { FileCheck, Search, Shield } from 'lucide-react';

function ServicesSection() {
  const services = [
    {
      icon: FileCheck,
      title: "Neubau Energienachweise",
      description: "Energienachweise für Neubauten nach aktuellen EnEV-Standards und GEG-Anforderungen.",
      color: "blue"
    },
    {
      icon: Search,
      title: "Bestandsgebäude",
      description: "Energieausweise für bestehende Gebäude und Sanierungsberatung.",
      color: "green"
    },
    {
      icon: Shield,
      title: "Beratung & Support",
      description: "Umfassende Beratung zu Energieeffizienz und rechtlichen Anforderungen.",
      color: "purple"
    }
  ];

  const getColorClasses = (color) => {
    const colors = {
      blue: "bg-blue-100 text-blue-600",
      green: "bg-green-100 text-green-600",
      purple: "bg-purple-100 text-purple-600"
    };
    return colors[color];
  };

  return (
    <section className="mt-10">
      <h2 className="text-2xl font-semibold mb-4 text-center">Unsere Dienstleistungen</h2>
      <p className="text-center text-gray-600 mb-8">
        Wir bieten umfassende Lösungen für alle Arten von Energienachweisen
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service, index) => {
          const IconComponent = service.icon;
          return (
            <div key={index} className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition">
              <div className={`w-12 h-12 ${getColorClasses(service.color)} rounded-lg flex items-center justify-center mb-4`}>
                <IconComponent className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-3">{service.title}</h3>
              <p className="text-sm text-gray-600">{service.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default ServicesSection;