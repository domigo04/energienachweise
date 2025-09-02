import React from 'react';

function HeroSection() {
  return (
    <section className="bg-white rounded-xl shadow-lg p-8 mt-8 text-center">
      <h2 className="text-4xl font-bold text-gray-800 mb-4">
        Energienachweise einfach vermittelt
      </h2>
      <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
        Professionelle Vermittlung von Energienachweisen für Gebäude. 
        Schnell, zuverlässig und nach neuesten Standards.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition">
          Energienachweis anfragen
        </button>
        <button className="border-2 border-blue-600 text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-blue-600 hover:text-white transition">
          Mehr erfahren
        </button>
      </div>
    </section>
  );
}

export default HeroSection;