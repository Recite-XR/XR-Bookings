// CONFIGURATION OBJECT - Customize these settings for your institution
const CONFIG = {
  spreadsheet: {
    id: 'YOUR_SPREADSHEET_ID_HERE', // The ID from your Google Spreadsheet URL
    sheetName: 'Bookings' // Name of the sheet storing bookings
  },
  
  institution: {
    name: 'Institution Name',
    systemName: 'Resource Booking System', // Appears in page title and emails
    contactEmail: 'department@institution.edu',
    contactPhone: '(XXX) XXX-XXXX',
    emailDomain: 'institution.edu', // For email validation
    departments: ['Department 1', 'Department 2'] // Add your departments/divisions
  },
  
  booking: {
    minAdvanceBookingDays: 2, // Minimum days in advance for booking
    sessionDurationMinutes: 60,
    dailyTimeSlots: [ // Customize your available time slots
      '9:00 AM',
      '10:00 AM',
      '11:00 AM',
      '12:00 PM',
      '1:00 PM',
      '2:00 PM',
      '3:00 PM',
      '4:00 PM'
    ],
    locations: [ // Add or remove locations as needed
      {
        name: 'Location 1',
        address: '123 Main Street, City, State ZIP'
      },
      {
        name: 'Location 2',
        address: '456 Second Street, City, State ZIP'
      }
    ]
  },
  
  calendar: {
    excludeWeekends: true,
    weeksToDisplay: 4 // Number of weeks to show in calendar
  }
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle(CONFIG.institution.systemName)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAvailableSlots() {
  var sheet = SpreadsheetApp.openById(CONFIG.spreadsheet.id).getSheets()[0];
  var today = new Date();
  var startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (startDate.getDay() + 6) % 7);
  var endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (CONFIG.calendar.weeksToDisplay * 7) - 1);
  var slots = [];

  for (var d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    var currentDate = new Date(d);
    var dayOfWeek = currentDate.getDay();

    if (CONFIG.calendar.excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) continue;

    var dateString = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];

    var availableTimes = getAvailableTimesForDate(sheet, dateString);

    slots.push({
      date: dateString,
      day: dayName,
      times: availableTimes,
      available: availableTimes.length > 0
    });
  }

  return slots;
}

function getAvailableTimesForDate(sheet, date) {
  var bookings = sheet.getDataRange().getValues();
  var bookedTimes = bookings.filter(row => row[0] === date).map(row => row[1]);
  return CONFIG.booking.dailyTimeSlots.filter(time => !bookedTimes.includes(time));
}

function bookSlot(bookingData) {
  var sheet = SpreadsheetApp.openById(CONFIG.spreadsheet.id).getSheets()[0];
  var bookingDate = new Date(bookingData.date);
  var today = new Date();

  if (!isDateBookable(bookingDate)) {
    return `Booking must be at least ${CONFIG.booking.minAdvanceBookingDays} business days in advance.`;
  }

  var bookings = sheet.getDataRange().getValues();
  for (var i = 1; i < bookings.length; i++) {
    if (bookings[i][0] == bookingData.date && bookings[i][1] == bookingData.time) {
      return "This slot is already booked.";
    }
  }

  // Record the booking
  sheet.appendRow([
    bookingData.date,
    bookingData.time,
    bookingData.name,
    bookingData.email,
    bookingData.phone,
    bookingData.location,
    bookingData.department,
    new Date()
  ]);

  sendMeetingInvitation(bookingData);
  return "Booking request submitted successfully!";
}

function isDateBookable(date) {
  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + CONFIG.booking.minAdvanceBookingDays);
  
  if (CONFIG.calendar.excludeWeekends) {
    // Adjust for weekends
    let extraDays = 0;
    for (let d = today; d <= minDate; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) extraDays++;
    }
    minDate.setDate(minDate.getDate() + extraDays);
  }

  return date >= minDate;
}

function sendMeetingInvitation(bookingData) {
  var startTime = new Date(bookingData.date + 'T' + convertTo24Hour(bookingData.time));
  var endTime = new Date(startTime.getTime() + CONFIG.booking.sessionDurationMinutes * 60 * 1000);

  var location = CONFIG.booking.locations.find(loc => loc.name === bookingData.location)?.address || 'TBD';

  var invitation = createICSFile(startTime, endTime, bookingData, location);

  var emailSubject = `${CONFIG.institution.systemName} Request: ${bookingData.date} ${bookingData.time}`;
  var emailBody = generateEmailBody(bookingData);

  MailApp.sendEmail({
    to: `${bookingData.email},${CONFIG.institution.contactEmail}`,
    subject: emailSubject,
    body: emailBody,
    attachments: [{
      fileName: 'invitation.ics',
      content: invitation,
      mimeType: 'text/calendar;method=REQUEST'
    }]
  });
}

function generateEmailBody(bookingData) {
  return `A new ${CONFIG.institution.systemName} request has been received:

Name: ${bookingData.name}
Email: ${bookingData.email}
Phone: ${bookingData.phone}
Date: ${bookingData.date}
Time: ${bookingData.time}
Location: ${bookingData.location}
Department: ${bookingData.department}

This is a booking request. A staff member will confirm your appointment via email or phone.

For questions, contact:
Email: ${CONFIG.institution.contactEmail}
Phone: ${CONFIG.institution.contactPhone}`;
}

function createICSFile(startTime, endTime, bookingData, location) {
  var ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//' + CONFIG.institution.name + '//' + CONFIG.institution.systemName + '//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:' + Utilities.getUuid(),
    'DTSTAMP:' + formatDateForICS(new Date()),
    'DTSTART:' + formatDateForICS(startTime),
    'DTEND:' + formatDateForICS(endTime),
    'SUMMARY:' + CONFIG.institution.systemName + ' Session',
    'LOCATION:' + location,
    'DESCRIPTION:' + CONFIG.institution.systemName + ' Session Request\\n' +
    'Name: ' + bookingData.name + '\\n' +
    'Email: ' + bookingData.email + '\\n' +
    'Phone: ' + bookingData.phone + '\\n' +
    'Department: ' + bookingData.department + '\\n\\n' +
    'This is a booking request pending confirmation.',
    'ORGANIZER;CN=' + CONFIG.institution.name + ':mailto:' + CONFIG.institution.contactEmail,
    'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:' + bookingData.email,
    'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:' + CONFIG.institution.contactEmail,
    'STATUS:TENTATIVE',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  
  return ics.join('\r\n');
}

function formatDateForICS(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyyMMdd\'T\'HHmmss\'Z\'');
}

function convertTo24Hour(time12h) {
  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') {
    hours = '00';
  }
  if (modifier === 'PM') {
    hours = parseInt(hours, 10) + 12;
  }
  return `${hours}:${minutes}:00`;
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
