const generateRegistrationConfirmationEmail = (firstName) => {
  return `
    <!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="x-apple-disable-message-reformatting">
    <title>Registration Successful</title>
    <link href="https://fonts.googleapis.com/css?family=Lato:300,400,700" rel="stylesheet">
</head>

<body style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly; background-color: #f1f1f1;">
    <center style="width: 100%; background-color: #f1f1f1;">
        <div
            style="display: none; font-size: 1px;max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all; font-family: sans-serif;">
            &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
        </div>
        <div style="max-width: 600px; margin: 0 auto;">
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
                style="margin: auto;">
                <tr>
                    <td valign="top" style="padding: 1em 2.5em 0 2.5em; background-color: #ffffff;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                            <tr></tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td valign="middle" style="padding: 3em 0 2em 0;">
                        <img src="https://www.the-curve.africa/static/media/curve2.b90648ddd7482f82d25a.png" alt=""
                            style="width: 300px; max-width: 600px; height: auto; margin: auto; display: block;">
                    </td>
                </tr>
                <tr>
                    <td valign="middle" style="padding: 2em 0 4em 0;">
                        <table>
                            <tr>
                                <td>
                                    <div style="padding: 0 2.5em; text-align: center;">
                                        <h2
                                            style="font-family: 'Lato', sans-serif; color: rgba(0,0,0,.3); font-size: 40px; margin-bottom: 0; font-weight: 400;">
                                            Registration Successful</h2>
                                        <h3 style="font-family: 'Lato', sans-serif; font-size: 24px; font-weight: 300;">
                                            Hi ${firstName},</h3>
                                        <p style="font-family: 'Lato', sans-serif; font-size: 18px; font-weight: 300; color: #555555; line-height: 1.6;">
                                            Thank you for registering. We have received your application successfully.
                                        </p>
                                        <p style="font-family: 'Lato', sans-serif; font-size: 18px; font-weight: 300; color: #555555; line-height: 1.6;">
                                            Our team will review your registration and contact you with further information soon.
                                        </p>
                                        <p style="font-family: 'Lato', sans-serif; font-size: 18px; font-weight: 300; color: #555555; line-height: 1.6; margin-top: 30px;">
                                            Thanks,<br>THE CURVE AFRICA
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
                style="margin: auto;">
                <tr>
                    <td style="text-align: center; background-color: #fafafa;">
                        © Copyright ${new Date().getFullYear()}. All rights reserved.<br />
                    </td>
                </tr>
            </table>
        </div>
    </center>
</body>

</html>
  `;
};

module.exports = { generateRegistrationConfirmationEmail };
