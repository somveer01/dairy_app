export const INDIAN_NAMES = [
  'Ramesh Sharma', 'Suresh Patel', 'Pooja Verma', 'Amit Kumar', 'Rajesh Gupta',
  'Sunil Yadav', 'Anil Mehta', 'Vijay Chauhan', 'Manoj Tiwari', 'Dinesh Singh',
  'Deepak Joshi', 'Sanjay Mishra', 'Pankaj Dubey', 'Alok Pandey', 'Ashok Saxena',
  'Mukesh Agarwal', 'Vikas Rawat', 'Mahesh Soni', 'Naresh Choudhary', 'Vinod Jha',
  'Kailash Rajput', 'Rohit Sen', 'Mohit Nair', 'Naveen Bhatt', 'Tarun Thakur',
  'Gopal Rathore', 'Harish Tripathi', 'Govind Prasad', 'Rakesh Maurya', 'Brijesh Pal',
  'Kishore Goswami', 'Bhupendra Lodhi', 'Devendra Baghel', 'Gaurav Kaushik', 'Hemant Dixit',
  'Jitendra Shukla', 'Kapil Gautam', 'Lalit Upadhyay', 'Nitin Bajpai', 'Omkar Awasthi',
  'Pradeep Dwivedi', 'Raghavendra Chaturvedi', 'Santosh Kulkarni', 'Satish Deshmukh', 'Subhash Shinde',
  'Surendra Patil', 'Umesh Jadhav', 'Virendra Pawar', 'Yogesh Kadam', 'Arun Mane'
];

export const generate50Customers = (supplierId = 'supp_default_1') => {
  return INDIAN_NAMES.map((name, index) => {
    const custNum = index + 1;
    const milkType = index % 2 === 0 ? 'cow' : 'buffalo';
    const defaultLitres = index % 3 === 0 ? 3.0 : index % 2 === 0 ? 2.0 : 1.5;
    const ratePerLitre = milkType === 'cow' ? 55 : 70;
    const phone = `98${String(10000000 + custNum * 12345).slice(0, 8)}`;

    return {
      id: `cust_${custNum}`,
      supplierId,
      name,
      phone,
      address: `House #${custNum}, Street ${((custNum % 5) + 1)}, Green City`,
      defaultLitres,
      milkType,
      ratePerLitre,
      notes: custNum % 4 === 0 ? 'Deliver early morning' : undefined,
      createdAt: Date.now() - (50 - index) * 86400000
    };
  });
};

export const generateDailyDeliveriesForCustomers = (
  customers,
  date,
  session = 'Morning',
  supplierId = 'supp_default_1'
) => {
  return customers.map(cust => {
    const qty = cust.defaultLitres;
    const rate = cust.ratePerLitre;
    const amount = qty * rate;

    return {
      id: `entry_${date}_${session}_${cust.id}`,
      supplierId,
      customerId: cust.id,
      customerName: cust.name,
      date,
      session,
      milkType: cust.milkType,
      quantityLitres: qty,
      ratePerLitre: rate,
      amount,
      isPaid: false,
      createdAt: Date.now()
    };
  });
};
