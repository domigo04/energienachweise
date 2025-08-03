import React from 'react';
import { useNavigate } from "react-router-dom";
import { ArrowRight, Zap, Users } from 'lucide-react';

function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      {/* Hero Split */}
      <div className="grid lg:grid-cols-2 min-h-[80vh]">
        {/* Left Side - Content */}
        <div className="flex flex-col justify-center p-8 lg:p-16 bg-white">
          <div className="max-w-lg">
            <div className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full mb-6">
              <Zap className="w-4 h-4 mr-2" />
              Schweiz 2025
            </div>
            
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Private<br />
              <span className="text-blue-600">Kontrollen</span><br />
              einfach finden
            </h1>
            
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Geben Sie einfach ein was Sie brauchen und wann - wir finden 
              den passenden zertifizierten Experten in Ihrer Region.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <button
  onClick={() => navigate("/kunden-registrierung")}
  className="group bg-gray-900 text-white px-8 py-4 rounded-2xl font-semibold flex items-center justify-center hover:bg-gray-800 transition-all"
>
  Kontrolle anfragen
  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
</button>

              <button
                onClick={() => navigate("/experte-werden")}
                className="group border-2 border-gray-200 text-gray-900 px-8 py-4 rounded-2xl font-semibold hover:border-gray-300 transition-all"
              >
                Als Experte registrieren
              </button>
            </div>
          </div>
        </div>
        
        {/* Right Side - Hand Cards Visual */}
        <div className="bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center p-8">
          <div className="relative w-[600px] h-[400px]">
            
            {/* Left Card - Input/Anfrage (leicht nach links geneigt) */}
            <div className="absolute left-0 top-8 transform -rotate-12 origin-bottom-right">
              <div className="bg-white rounded-3xl p-6 shadow-xl w-72">
                <h4 className="font-semibold text-gray-900 mb-4">Was brauchen Sie?</h4>
                
                <div className="space-y-3 text-sm">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-600">Art der Kontrolle</p>
                    <p className="font-medium">→ EN-103 Heizungsersatz</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-600">Standort</p>
                    <p className="font-medium">→ Zürich, 8001</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-600">Gewünschter Termin</p>
                    <p className="font-medium">→ In den nächsten 2 Wochen</p>
                  </div>
                </div>
                
                <button className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold mt-4">
                  Experten finden
                </button>
              </div>
            </div>
            
            {/* Right Card - Result/Experte (leicht nach rechts geneigt, etwas höher) */}
            <div className="absolute right-0 top-0 transform rotate-12 origin-bottom-left">
              <div className="bg-white rounded-3xl p-6 shadow-xl w-72">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mr-3">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Max Müller</p>
                    <p className="text-sm text-gray-500">Energieberater</p>
                  </div>
                </div>
                
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Verfügbarkeit</span>
                    <span className="text-green-600 font-semibold">Diese Woche</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Preis</span>
                    <span className="font-semibold">CHF 450</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bewertung</span>
                    <span className="font-semibold">4.9 ⭐</span>
                  </div>
                </div>
                
                <button className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold mt-4">
                  Kontaktieren
                </button>
              </div>
            </div>
            
            {/* Floating Elements - grün bleibt, blau minimal höher und mehr links */}
            <div className="absolute top-4 right-12 transform rotate-12 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold z-10">
              3 Experten gefunden
            </div>
            
            <div className="absolute top-12 left-0 transform -rotate-12 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold z-10">
              ⚡ Antwort in 24h
            </div>
          </div>
        </div>
      </div>
      
      {/* Features Grid */}
      <div className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Für beide Seiten perfekt
            </h2>
            <p className="text-xl text-gray-600">
              Ob Sie Experte sind oder eine Kontrolle benötigen
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Experten Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-6">
                <Users className="w-8 h-8 text-white" />
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Für Experten
              </h3>
              
              <p className="text-gray-600 mb-6">
                Erweitern Sie Ihr Geschäft mit direkten Aufträgen. Kunden beschreiben 
                genau was sie brauchen - Sie erhalten nur passende Anfragen.
              </p>
              
              <ul className="space-y-3 mb-8">
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
                  Unterlagen und Anfragen direkt erhalten
                </li>
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
                  Nur qualifizierte Anfragen erhalten
                </li>
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
                  Ihre Preise, Ihre Verfügbarkeit
                </li>
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
                  Direkte Kommunikation mit Kunden
                </li>
              </ul>
              
              <button 
                onClick={() => navigate("/experte-werden")}
                className="group text-purple-600 font-semibold flex items-center hover:text-purple-700"
              >
                Experte werden
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            
            {/* Kunden Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-6">
                <Zap className="w-8 h-8 text-white" />
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Für Auftraggeber
              </h3>
              
              <p className="text-gray-600 mb-6">
                Beschreiben Sie einfach Ihr Projekt: Art der Kontrolle, Standort, 
                gewünschter Termin. Wir zeigen Ihnen passende Experten mit Preisen.
              </p>
              
              <ul className="space-y-3 mb-8">
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  Eingabe in 2 Minuten, Angebote in 24h
                </li>
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  Vergleichen Sie Preise und Bewertungen
                </li>
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  Direkte Terminvereinbarung möglich
                </li>
              </ul>
              
              <button
  onClick={() => navigate("/kunden-registrierung")}
  className="group text-blue-600 font-semibold flex items-center hover:text-blue-700"
>
  Kontrolle beauftragen
  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
</button>

            </div>
          </div>
        </div>
      </div>
      
      {/* Process */}
      <div className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-8 text-center">
          <h3 className="text-3xl font-bold text-gray-900 mb-4">
            So einfach geht's
          </h3>
          <p className="text-gray-600 mb-16">In nur drei Schritten zum Ziel</p>
          
          <div className="grid md:grid-cols-3 gap-12">
            <div className="relative">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-blue-600">1</span>
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-3">Anfrage beschreiben</h4>
              <p className="text-gray-600">Art der Kontrolle, Ihr Standort und gewünschter Termin - fertig in 2 Minuten</p>
            </div>
            
            <div className="relative">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-blue-600">2</span>
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-3">Experten erhalten</h4>
              <p className="text-gray-600">Binnen 24h zeigen wir Ihnen passende Fachpersonen mit Preisen und Verfügbarkeit</p>
            </div>
            
            <div className="relative">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-blue-600">3</span>
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-3">Direkt kontaktieren</h4>
              <p className="text-gray-600">Wählen Sie Ihren Favoriten und vereinbaren den Termin direkt - ohne Umwege</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;