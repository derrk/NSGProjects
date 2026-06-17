import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { name, email, phone, collectionType, estimatedValue, notes } = await req.json();

  if (!name || !email || !collectionType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { error } = await resend.emails.send({
    from: 'Secret Stock TX <noreply@secretstocktx.com>',
    to: 'info@secretstocktx.com',
    replyTo: email,
    subject: `Collection Review Request — ${collectionType} from ${name}`,
    html: `
      <h2>New Collection Review Request</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
      ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
      <p><strong>Collection Type:</strong> ${collectionType}</p>
      ${estimatedValue ? `<p><strong>Estimated Value:</strong> ${estimatedValue}</p>` : ''}
      ${notes ? `<p><strong>Notes:</strong></p><p style="white-space:pre-wrap">${notes}</p>` : ''}
    `,
  });

  if (error) {
    console.error('Resend error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
