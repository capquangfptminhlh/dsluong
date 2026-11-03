import React, { useEffect, useState } from 'react';
import RetailPOS from './RetailPOS';
import SpaPOS from './SpaPOS';
import FnbPOS from './FnbPOS';
import HotelPOS from './HotelPOS';
import PetShopPOS from './PetShopPOS';

function getIndustry() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return localStorage.getItem('industry_type') || user.sector || 'retail';
  } catch {
    return 'retail';
  }
}

export default function POS() {
  const [industry, setIndustry] = useState(getIndustry);

  useEffect(() => {
    const syncIndustry = () => setIndustry(getIndustry());
    window.addEventListener('industryChange', syncIndustry);
    window.addEventListener('storage', syncIndustry);
    return () => {
      window.removeEventListener('industryChange', syncIndustry);
      window.removeEventListener('storage', syncIndustry);
    };
  }, []);

  if (industry === 'spa') return <SpaPOS />;
  if (industry === 'fnb') return <FnbPOS />;
  if (industry === 'hotel') return <HotelPOS />;
  if (industry === 'petshop') return <PetShopPOS />;
  return <RetailPOS />;
}
