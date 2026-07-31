import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'pages/login.html',
        templates: 'pages/templates.html',
        details: 'pages/details.html',
        records: 'pages/records.html',
        doctor: 'pages/doctor.html',
        consultation: 'pages/consultation.html',
        labRequest: 'pages/lab_request.html',
        initialConsultation: 'pages/initial_consultation.html',
        followUpVisitation: 'pages/follow_up_visitation.html',
        nurse: 'pages/nurse.html',
        bhw: 'pages/bhw.html',
        pharmacist: 'pages/pharmacist.html',
        laboratory: 'pages/laboratory.html',
        midwife: 'pages/midwife.html',
        admin: 'pages/admin.html',
      }
    }
  }
})
