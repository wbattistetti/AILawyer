export type AddressType = 'residence' | 'domicile' | 'elected_domicile';

export type Address = {
  type: AddressType;
  raw: string;
  cleaned: string;
  components: {
    recipient?: string;
    road?: string;
    house_number?: string;
    stair?: string;
    unit?: string;
    km?: string;
    hamlet?: string;
    locality?: string;
    municipality?: string;
    province?: string;
    region?: string;
    postcode?: string;
    country?: string;
  };
  norm: string;
  confidence: number;
  engine: 'libpostal' | 'regex';
  notes: string[];
  version: string;
};




